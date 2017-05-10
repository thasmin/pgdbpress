var fs      = require('fs')
var PEG     = require("pegjs")
var PEGUtil = require("pegjs-util")
var parser  = PEG.generate(fs.readFileSync("sql.pegjs", "utf8"));

var db = require('./pool').pool;

exports.parse_stmt = function(stmt)
{
	var result = PEGUtil.parse(parser, stmt);
	if (result.error !== null) {
		console.log("ERROR: Parsing Failure:\n" + PEGUtil.errorMessage(result.error, true).replace(/^/mg, "ERROR: "))
		return null;
	}
	return result.ast;
}

exports.ast_to_pgsql = function(ast)
{
	if (!ast)
		return null;

	switch (ast.expr) {
		case 'SELECT': return Promise.resolve(select_to_pgsql(ast));
		case 'CREATE': return Promise.resolve(create_to_pgsql(ast));
		case 'INSERT': return Promise.resolve(insert_to_pgsql(ast));
		case 'UPDATE': return Promise.resolve(update_to_pgsql(ast));
		case 'DELETE': return delete_to_pgsql(ast);
		default: return Promise.reject('unknown expression: ' + ast.expr);
	}
}

function field_list_str(field_list) {
	return field_list.map(f => field_str(f)).join(', ');
}

function field_str(field)
{
	if (field.alias)
		return field_str_inner(field) + ' AS ' + field_str_inner(field.alias);
	return field_str_inner(field);
}

function field_str_inner(field)
{
	if (field.fn)
		return field.fn + "(" + field.args.map(field_str).join(', ') + ")";
	if (field.aggregate)
		return field.aggregate + '(' + field_str(field.field) + ')';
	if (field.table)
		return field.table + '.' + field.ident;
	if (field.ident)
		return field.ident;
	return field;
}

function datatype_str(dt)
{
	// numbers don't have sizes except for numeric
	// no unsigned numbers in postgresql without domains
	var t = dt.type || dt.toUpperCase();
	switch (t) {
		case 'BIGINT':
		case 'INT':
			return t;
		case 'VARCHAR':
			return t + "(" + dt.size + ")";
		case 'LONGTEXT':
		case 'MEDIUMTEXT':
		case 'TINYTEXT':
			return 'TEXT';
		case 'DATETIME':
			return 'TIMESTAMP';
		default:
			return t;
	}
}

function delete_to_pgsql(ast)
{
	if (!ast.tables) {
		var parts = ['DELETE FROM', field_str(ast.table), 'WHERE'];
		parts.push(ast.where.map(where_clause).map(w => w.join(' ')).join(' '));
		return Promise.resolve(parts.join(' '));
	}
	
	return new Promise((resolve, reject) => {
		// strategy: get primary key fields for all tables, find ids for rows to delete, delete rows
		var primary_key_fields = {};
		var tables = ast.aliases.map(t => t.ident);
		tables = tables.filter((el, pos) => tables.indexOf(el) == pos); // make unique
		var promises = tables.map(t => {
			var sql = "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary;";
			var promise = db.query(sql, [t]);
			promise = promise.then(res => {
				primary_key_fields[t] = res.rows.map(r => r.attname);
			});
			return promise;
		});
		var all = Promise.all(promises).then(v => {
			//console.log(primary_key_fields);
			var to_fetch = ast.tables.filter(t => ast.aliases.map(a => a.alias).includes(t));
			var fetch_sqls = to_fetch.map(t => {
				var table = ast.aliases.filter(a => a.alias).map(a => a.ident)[0];
				var fields = primary_key_fields[table];
				fields = fields.map(f => t + "." + f).join(', ');
				return "SELECT " + fields + " FROM " + field_list_str(ast.aliases) + " WHERE " + where_clause(ast.where).join(' ');
			});
			fetch_sqls.forEach(sql => {
				db.query(sql, [], (err, result) => {
					if (err) {
						console.log('error: ' + err.message);
						if (err.message.indexOf('operator does not exist: ') === 0) {
							// comparison type mismatch
							// find out the types
							var types = err.message.substr('operator does not exist: '.length).split(' ');
							// find first nonspace after error
							var errorAt = parseInt(err.position, 10);
							while (/\s/.test(sql[errorAt]))
								errorAt += 1;
							var remainder = sql.substr(errorAt);
							var spaceAt = remainder.match(/[^ ] /).index+1;
							var fixed = remainder.substr(0, spaceAt) + "::" + types[0] + remainder.substr(spaceAt);
							sql = sql.substr(0, errorAt) + fixed;
							console.log(sql);
						}
					}
					console.log(result);
				});
			});
			console.log(fetch_sqls);
			resolve('done');
		}).catch(reject);
	});
}

function handle_result(err, result)
{
}

function create_to_pgsql(ast)
{
	var parts = ['CREATE TABLE'];
	parts.push(ast.table);
	parts.push('(');

	var fields_str = [];
	ast.def.fields.forEach(function(field) {
		var f = [];
		// name, datatype, can_be_null, auto_increment
		f.push(field.name);
		if (field.auto_increment)
			f.push('SERIAL')
		else
			f.push(datatype_str(field.datatype));
		if (!field.can_be_null)
			f.push('NOT NULL');
		if (field.default) {
			if (field.default != "'0000-00-00 00:00:00'")
				f.push('DEFAULT ' + field.default);
		}
		fields_str.push(f.join(' '));
	});
	parts.push(fields_str.join(', '));

	var keys_str = [];
	ast.def.keys.forEach(function(key) {
		switch (key.type) {
			case 'PRIMARY':
				keys_str.push('PRIMARY KEY (' + key.fields.map(function(f) { return f.field; }).join(',') + ')');
				break;
			case 'UNIQUE':
				keys_str.push('UNIQUE (' + key.fields.map(function(f) { return f.field; }).join(',') + ')');
				break;
		}
	});
	if (keys_str.length) {
		parts.push(',');
		parts.push(keys_str.join(','));
	}

	parts.push(');');

	ast.def.keys.filter(key => key.type == 'INDEX').forEach(key => {
		var index_str = ['CREATE INDEX'];
		index_str.push(ast.table + "_" + key.name);
		index_str.push('ON');
		index_str.push(ast.table);
		index_str.push('(');
		index_str.push(key.fields.map(f => f.field).join(','));
		index_str.push(');');
		parts.push(index_str.join(' '));
	});

	return parts.join(' ');
}

function insert_to_pgsql(ast)
{
	var parts = ['INSERT INTO', field_str(ast.table)];
	parts.push('(' + ast.fields.map(field_str).join(', ') + ')');
	parts.push('VALUES');
	parts = parts.concat(ast.values.map(v => '(' + v.join(', ') + ')').join(', '));

	if (ast.on_dupe_key) {
		parts.push('ON DUPLICATE KEY UPDATE');
		var odks = [];
		ast.on_dupe_key.map(k => {
			odks.push([ field_str(k.field), '=VALUES(', field_str(k.value), ')' ].join(''));
		});
		parts.push( odks.join(', ') );
	}

	return parts.join(' ') + ';';
}

function update_to_pgsql(ast)
{
	var parts = ['UPDATE', ast.table, 'SET'];
	
	var changes = [];
	ast.changes.forEach(f => {
		changes.push(f.field + '=' + field_str(f.value));
	});
	parts.push(changes.join(', '));
	return parts.join(' ') + ';';
}

function where_expr(w)
{
	w.value = field_str(w.value);
	if (w.oper.toUpperCase() == 'IN' || w.oper.toUpperCase() == 'NOT IN')
		return [ field_str(w.field), w.oper, '(' + w.value + ')'];
	if (w.oper.toUpperCase() == 'REGEXP')
		w.oper = 'SIMILAR TO';
	return [ field_str(w.field), w.oper, w.value ];
}
exports.where_expr = where_expr;

function where_clause(w) {
	var arr = [];
	// first clause
	if (w.combiner) {
		arr.push(w.combiner);
		w = w.expr;
	}

	// no parentheses
	if (!Array.isArray(w))
		return arr.concat(where_expr(w));

	arr.push(' (');
	w.forEach(e => arr = arr.concat(where_clause(e)));
	arr.push(')');
	return arr;
}

function select_to_pgsql(ast)
{
	var parts = ['SELECT'];
	if (ast.calc_found_rows)
		parts.push('SQL_CALC_FOUND_ROWS');
	if (ast.distinct)
		parts.push('DISTINCT');
	parts.push(ast.fields.map(field_str).join(', '));

	if (ast.from) {
		parts.push('FROM');
		parts = parts.concat(field_str(ast.from));
	}

	ast.join.forEach(j => {
		parts.push(j.type);
		parts.push('JOIN');
		parts = parts.concat(field_str(j.table));
		parts.push('ON');
		parts = parts.concat(where_clause(j.expr));
	});

	if (ast.where) {
		parts.push('WHERE');
		parts.push(ast.where.map(where_clause).map(w => w.join(' ')).join(' '));
	}

	if (ast.groupby) {
		parts.push('GROUP BY ' + ast.groupby.map(field_str).join(', '));
	}

	if (ast.orderby) {
		parts.push('ORDER BY');
		var orderby = [];
		ast.orderby.forEach(function(ob) {
			if (ob.order)
				orderby.push(field_str(ob.field) + ' ' + ob.order);
			else
				orderby.push(field_str(ob.field));
		});
		parts.push(orderby.join(', '));
	}

	if (ast.limit) {
		parts.push('LIMIT');
		parts.push(ast.limit.first);
		if (ast.limit.second) {
			parts.push(',');
			parts.push(ast.limit.second);
		}
	}

	return parts.join(' ') + ';';
}


