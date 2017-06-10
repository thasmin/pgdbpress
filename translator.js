var fs      = require('fs')
var PEG     = require("pegjs")
var PEGUtil = require("pegjs-util")
var parser  = PEG.generate(fs.readFileSync("sql.pegjs", "utf8"));

var db = null;

var default_timestamp_00s = [];

function ok(affectedRows = null, insertId = null)
{
	return Promise.resolve({
		result: 'ok',
		affectedRows: affectedRows,
		insertId: insertId
	});
}

function rowset(result)
{
	return {
		result: 'rowset',
		columns: result.fields.map(to_column),
		rows: result.rows.map(to_row)
	};
}

function rowset_data(columns, data)
{
	return {
		result: 'rowset',
		columns: columns.map(col => { return {
			table: 1,
			name: col,
			dataType: 19
		};}),
		rows: data
	};
}

function table_not_found(query, table)
{
	return Promise.resolve({
		result: 'table_not_found',
		query: query,
		table: table
	});
}

function db_error(query, reason)
{
	return Promise.resolve({
		result: 'error',
		query: query,
		reason: reason
	});
}

function to_column(field)
{
	return {
		table: field.tableID,
		name: field.name,
		dataType: field.dataTypeID,
	};
}

function convert_date_to_zero(str)
{
	if (str == '0001-01-01 00:00:00') {
console.log('got a zero date');
		return '0000-00-00 00:00:00';
	}
	return str;
}

function to_row(r)
{
	return r.map(convert_date_to_zero);
}

exports.translate = function(query)
{
	var query_lower = query.toLowerCase();
	if (query_lower == 'select @@version_comment limit 1')
		return Promise.resolve(rowset_data(['@@version_comment'], [['Ubuntu 17.04']]));
	if (query_lower == 'select database()')
		return Promise.resolve(rowset_data(['database'], [[db.name]]));
	if (query_lower == 'select @@session.sql_mode')
		return Promise.resolve(rowset_data(['@@session.sql_mode'], [['NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION']]));

	var ast = null;
	try {
		ast = exports.parse_stmt(query);
	} catch (e) {
		return Promise.reject(new Error('got an error while parsing: ' + query, e));
	}

	if (ast == null)
		return Promise.resolve(eof());
	if (ast.expr == 'SET')
		return Promise.resolve(ok());

	// there's one query that's locally cached
	if (ast.expr == 'SELECT' && ast.fields.length == 1 && ast.fields[0].ident == 'FOUND_ROWS()') {
//console.log('sending back calced rows: ' + last_calc_found_rows);
		return Promise.resolve(rowset_data([ ast.fields[0].ident ], [[ last_calc_found_rows ]]));
	}

	return new Promise((resolve, reject) => {
		exports.ast_to_pgsql(ast).then(r => {
			var sql = r[0];
			var params = r[1];

			db.query(sql, params)
				.then(result => {
//console.log();
//console.log('query: ' + query);
//console.log('sent: ' + sql);
//if (params.length > 0) console.log(params);
//console.log(result);
					if (['SELECT', 'SHOW', 'EXPLAIN'].includes(ast.expr)) {
//console.log(result.rows);
						var full_count_index = result.fields.findIndex(f => f.name == '_translator_full_count')
						if (result.rows.length > 0 && full_count_index) {
							last_calc_found_rows = result.rows[0][full_count_index];
//console.log('calced rows:' + last_calc_found_rows);
						}
//console.log('writing ' + result.fields.length + ' columns');
						return resolve(rowset(result));
					} else if (ast.expr == 'INSERT') {
//console.log(result);
						var affectedRows = result.rowCount;
						db.query('SELECT LASTVAL()', []).then(lastval_result =>  {
//console.log();
//console.log('query: ' + query);
//console.log(lastval_result);
							if (lastval_result.rows.length > 0)
								return resolve(ok(affectedRows, lastval_result.rows[0][0]));
							else
								return resolve(ok(affectedRows));
						}).catch(e => {
//console.log('no lastval available');
							return resolve(ok(affectedRows));
						});
					} else if (ast.expr == 'UPDATE' || ast.expr == 'DELETE') {
//console.log(result);
						return resolve(ok(result.rowCount));
					} else if (ast.expr == 'CREATE') {
						return resolve(ok());
					}
				})
				.catch(err => {
					if (ast.expr == 'INSERT' && ast.ignore)
						return resolve(ok());

					var missing_table = err.message.match(/^relation "(.*)" does not exist$/);
					if (missing_table)
						return reject(table_not_found(query, db.name + "." + missing_table[1]));
					return reject(db_error(query, err.message));
				});
		}).catch(err => {
			reject(new Error('got an error while translating: ' + query, err));
		});
	});
}

exports.init = function(init_db)
{
	db = init_db;

	// find out which fields need to be converted from 0001-01-01 to 0000-00-00
	// TODO: cache and igure out when to invalidate
	var sql = "SELECT c.relname, f.attname FROM pg_attribute f JOIN pg_class c ON c.oid = f.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = f.attnum LEFT JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r'::char AND f.attnum > 0 AND n.nspname = 'public' AND f.atthasdef = 't' AND pg_get_expr(d.adbin, d.adrelid) = '''0001-01-01 00:00:00''::timestamp without time zone'";
	db.query(sql, []).then(result => { default_timestamp_00s = result.rows; });
}

exports.parse_stmt = function(stmt)
{
	var result = PEGUtil.parse(parser, stmt);
	if (result.error !== null) {
		console.log("ERROR: Parsing Failure:\n" + stmt + "\n" + PEGUtil.errorMessage(result.error, true).replace(/^/mg, "ERROR: "))
		return null;
	}
	return result.ast;
}

// returns a promise that has [sql, params]
exports.ast_to_pgsql = function(ast)
{
	if (!ast)
		return null;

	try {
		switch (ast.expr) {
			case 'SELECT': return Promise.resolve([select_to_pgsql(ast), []]);
			case 'CREATE': return Promise.resolve([create_to_pgsql(ast), []]);
			case 'INSERT': return insert_to_pgsql(ast);
			case 'UPDATE': return Promise.resolve(update_to_pgsql(ast));
			case 'DELETE': return delete_to_pgsql(ast);
			case 'SHOW'  : return Promise.resolve(show_to_pgsql(ast));
			default: return Promise.reject('unknown expression: ' + ast.expr);
		}
	} catch (e) {
		return Promise.reject(e);
	}
}

function show_to_pgsql(ast)
{
	if (ast.obj == 'DATABASES')
		return ['SELECT datname FROM pg_database WHERE datistemplate = false', []];

	if (ast.obj == 'FULL COLUMNS') {
		// return Field, Type, Collation, Null (YES/NO), Key (PRI), Default, Extra
		// collation is hardcoded to utf8mb4_unicode_ci even though it doesn't make sense for numbers and is wrong for blobs which are binary
		return ["SELECT f.attname AS \"Field\", pg_catalog.format_type(f.atttypid,f.atttypmod) AS \"Type\", 'utf8mb4_unicode_ci' AS \"Collation\", CASE WHEN f.attnotnull THEN 'NO' ELSE 'YES' END AS \"Null\", CASE WHEN p.contype = 'p' THEN 'PRI' ELSE '' END AS \"Key\", CASE WHEN f.atthasdef = 't' THEN d.adsrc END AS \"Default\", '' AS \"Extra\" FROM pg_attribute f JOIN pg_class c ON c.oid = f.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = f.attnum LEFT JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_constraint p ON p.conrelid = c.oid AND f.attnum = ANY (p.conkey) WHERE c.relkind = 'r'::char AND f.attnum > 0 AND n.nspname = 'public' and c.relname = $1",
			[unquoteize(field_str(ast.table))]
		];
	}

	if (ast.obj == 'COLUMNS') {
		// return Field, Type, Null (YES/NO), Key (PRI), Default, Extra
		return ["SELECT f.attname AS \"Field\", pg_catalog.format_type(f.atttypid,f.atttypmod) AS \"Type\", CASE WHEN f.attnotnull THEN 'NO' ELSE 'YES' END AS \"Null\", CASE WHEN p.contype = 'p' THEN 'PRI' ELSE '' END AS \"Key\", CASE WHEN f.atthasdef = 't' THEN d.adsrc END AS \"Default\", '' AS \"Extra\" FROM pg_attribute f JOIN pg_class c ON c.oid = f.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = f.attnum LEFT JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_constraint p ON p.conrelid = c.oid AND f.attnum = ANY (p.conkey) WHERE c.relkind = 'r'::char AND f.attnum > 0 AND n.nspname = 'public' and c.relname = $1",
			[unquoteize(field_str(ast.table))]
		];
}

	if (ast.obj == 'TABLES') {
		if (!ast.cond)
			return ["SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name", []];
		else if (ast.cond.oper == 'LIKE')
			return ["SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE " + ast.cond.value + " ORDER BY table_name", []];
		else if (ast.cond.oper == 'WHERE')
			return ["SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name AND " + where_expr(ast.cond.expr) + " ORDER BY table_name", []];
	}
}

function field_list_str(field_list)
{
	return field_list.map(f => field_str(f)).join(', ');
}

function field_str(field)
{
	if (field.alias)
		return field_str_inner(field) + ' AS ' + field_str_inner(field.alias);
	return field_str_inner(field);
}

function dqnostar(str)
{
	if (str == '*')
		return str;
	return dq(str);
}

function field_str_inner(field)
{
	var extract_date_fxns = ['YEAR', 'MONTH', 'DAY'];

	if (field.oper)
		return where_expr(field).join(' ');
	if (field.fn) {
		if (extract_date_fxns.includes(field.fn.toUpperCase()))
			return 'EXTRACT(' + field.fn.toUpperCase() + ' FROM ' + field.args.map(field_str).join(', ') + ')';
		return field.fn + '(' + field.args.map(field_str).join(', ') + ')';
	}
	if (field.table)
		return field.table + '.' + dqnostar(field.ident);
	if (field.ident == 'true' || field.ident == 'false')
		return field.ident;
	if (field.ident)
		return dqnostar(field.ident);
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
			return t + '(' + dt.size + ')';
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

var primary_key_fields = {};
// the value in resolve is unusable
function get_primary_key_fields(tables)
{
	tables = tables.filter((el, pos) => tables.indexOf(el) == pos); // make unique
	if (tables.every(t => t in primary_key_fields))
		return Promise.resolve(tables);

	return Promise.all(tables.map(t => {
		var sql = 'SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary;';
		return db.query(sql, [t]).then(res => {
			primary_key_fields[t] = res.rows.map(r => r[0]);
		}).catch(e => {
			console.log('error getting primary key field names');
			console.log(e);
		});

	}));
}

var unique_key_fields = {};
// only returns one unique key in the table
function get_unique_key_field_name(table)
{
	//sql = "SELECT conname FROM pg_constraint WHERE conrelid = (SELECT oid FROM pg_class WHERE relname LIKE $1) AND contype = 'u'";
	// probably not the best way to get it
	sql = 'SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND NOT i.indisprimary'
	return db.query(sql, [unquoteize(table)])
		.then(res => { unique_key_fields[table] = res.rows[0][0]; } )
		.catch(err => {
			console.log('error getting unique key field name');
			console.log(err);
		});
}

function delete_to_pgsql(ast)
{
	if (!ast.tables) {
		var parts = ['DELETE FROM', field_str(ast.table), 'WHERE'];
		parts.push(ast.where.map(where_clause).map(w => w.join(' ')).join(' '));
		return Promise.resolve([parts.join(' '), []]);
	}
	
	return new Promise((resolve, reject) => {
		// step 1: find primary key for relevant tables -- only works with single field primary keys
		var tables = ast.aliases.map(a => a.ident);
		tables = tables.filter((el, pos) => tables.indexOf(el) == pos); // make unique
		get_primary_key_fields(tables).then(v => {
			var aliases = ast.tables.filter(t => ast.aliases.map(a => a.alias).includes(t));
			var fetch_promises = aliases.map(t => {
				var table_name = ast.aliases.filter(a => a.alias == t).map(a => a.ident)[0];
				var key_fields = primary_key_fields[table_name];
				key_fields = key_fields.map(f => t + '.' + f).join(', ');
				// run query to get primary of rows to be deleted
				var sql = 'SELECT ' + key_fields + ' FROM ' + field_list_str(ast.aliases) + ' WHERE ' + where_clause(ast.where).join(' ');
				return db.query(sql)
					.then(result => {
						// return query to delete relevant rows
						if (result.rowCount == 0)
							return '';
						var values = result.rows.map(r => r[Object.keys(r)[0]] ); // assumes one field in primary key
						return 'DELETE FROM ' + table_name + ' WHERE ' + primary_key_fields[table_name][0] + ' IN (' + values.join(',') + ')';
					})
					.catch(reject);
			});
			Promise.all(fetch_promises).then(stmts => {
				resolve([stmts.join('; '), []]);
			});
		}).catch(reject);
	});
}

function handle_result(err, result)
{
}

function dq(str)
{
	return '"' + str + '"';
}

function create_to_pgsql(ast)
{
	var parts = ['CREATE TABLE'];
	parts.push(ast.table);
	parts.push('(');

	var fields_str = [];
	ast.def.fields.forEach(field => {
		var f = [];
		// name, datatype, can_be_null, auto_increment
		f.push(dq(field.name));
		if (field.auto_increment)
			f.push('SERIAL')
		else
			f.push(datatype_str(field.datatype));
		if (!field.can_be_null)
			f.push('NOT NULL');
		if (field.default) {
			if (field.default == "'0000-00-00 00:00:00'")
				field.default = "'0001-01-01 00:00:00'";
			f.push('DEFAULT ' + field.default);
		}
		fields_str.push(f.join(' '));
	});
	parts.push(fields_str.join(', '));

	var keys_str = [];
	ast.def.keys.forEach(key => {
		switch (key.type) {
			case 'PRIMARY':
				keys_str.push('PRIMARY KEY (' + key.fields.map(f => dq(f.field)).join(',') + ')');
				break;
			case 'UNIQUE':
				keys_str.push('UNIQUE (' + key.fields.map(f => dq(f.field)) + ')');
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
		index_str.push(ast.table + '_' + key.name);
		index_str.push('ON');
		index_str.push(ast.table);
		index_str.push('(');
		index_str.push(key.fields.map(f => dq(f.field)).join(','));
		index_str.push(');');
		parts.push(index_str.join(' '));
	});

	return parts.join(' ');
}

function insert_to_pgsql(ast)
{
	var param_num = 1;
	// each values() get turned into "(" + inner + ")"
	// each inner gets turned into "$" + param number joined by ", "
	var placeholders = ast.values.map(v => '(' + v.map(p => '$' + param_num++).join(', ') + ')').join(', ');
	var flat_values = ast.values.reduce((a,b) => a.concat(b), []);
	flat_values = flat_values.map(unquoteize);
	flat_values = flat_values.map(fix_zero_date);

	var parts = ['INSERT INTO', field_str(ast.table)];
	parts.push('(' + ast.fields.map(field_str).join(', ') + ')');
	parts.push('VALUES');
	parts = parts.concat(placeholders);

	// adding on conflict clause requires primary keys
	if (ast.on_dupe_key) {
		var table = field_str(ast.table);
		return get_unique_key_field_name(table).then(() => {
			var key_name = unique_key_fields[table];
			parts.push('ON CONFLICT (' + key_name + ') DO UPDATE SET');
			var odks = [];
			ast.on_dupe_key.map(k => {
				odks.push([ unquoteize(field_str(k.field)), '=', 'excluded.' + unquoteize(field_str(k.value)) ].join(''));
			});
			parts.push( odks.join(', ') );
			return Promise.resolve([parts.join(' ') + ';', flat_values]);
		}).catch(e => {
			console.log('error getting unique key field name');
			console.log(e);
		});
	}

	return Promise.resolve([parts.join(' ') + ';', flat_values]);
}

// TODO?: change parser so it doesn't return quotes with literals
function unquoteize(str)
{
	if (str[0] == "'" || str[str.length-1] == "'")
		return unquoteize(str.substring(1, str.length-1));
	if (str[0] == '"' || str[str.length-1] == '"')
		return unquoteize(str.substring(1, str.length-1));
	return str;
}

function fix_zero_date(str)
{
	if (str == '0000-00-00 00:00:00')
		return '0001-01-01 00:00:00';
	return str;
}

function update_to_pgsql(ast)
{
	var parts = ['UPDATE', field_str(ast.table), 'SET'];
	
	var param_count = 1;
	var params = ast.changes.map(f => field_str(f.value));
	params = params.map(unquoteize);
	params = params.map(fix_zero_date);

	var changes = [];
	ast.changes.forEach(f => {
		changes.push(field_str(f.field) + '=$' + (param_count++));
	});
	parts.push(changes.join(', '));

	if (ast.where) {
		parts.push('WHERE');
		parts = parts.concat(where_clause(ast.where).join(''));
	}

	return [parts.join(' ') + ';', params];
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
	if (w.length == 1)
		return arr.concat(where_clause(w[0]));

	arr.push(' (');
	w.forEach(e => arr = arr.concat(where_clause(e)));
	arr.push(')');
	return arr;
}

function table_name(obj)
{
	if (obj.table)
		return obj.table;
	if (obj.ident)
		return obj.ident;
	return obj;
}

function using_clause(table1, table2, using)
{
	var t1 = table_name(table1);
	var t2 = table_name(table2);
	var parts = using.map(u => {
		var using_field = unquoteize(field_str(u));
		return field_str({table: table_name(table1), ident:using_field}) +
			" = " +
			field_str({table: table_name(table2), ident:using_field});
	});
	return parts.join(' AND ');
}

function select_to_pgsql(ast)
{
	var parts = ['SELECT'];
	if (ast.distinct)
		parts.push('DISTINCT');

	if (ast.calc_found_rows)
		ast.fields.push('COUNT(*) OVER() AS _translator_full_count');
	var fields_str = ast.fields.map(field_str).join(', ');
	parts.push(fields_str);

	if (ast.from) {
		parts.push('FROM');
		parts = parts.concat(ast.from.map(field_str).join(', '));
	}

	ast.join.forEach(j => {
		parts.push(j.type);
		parts.push('JOIN');
		parts = parts.concat(field_str(j.table));
		parts.push('ON');
		if (j.expr)
			parts = parts.concat(where_clause(j.expr));
		else
			parts = parts.concat(using_clause(ast.fields[0], j.table, j.using));
	});

	if (ast.where) {
		parts.push('WHERE');
		parts.push(ast.where.map(where_clause).map(w => w.join(' ')).join(' '));
	}

	if (ast.groupby) {
		parts.push('GROUP BY ' + ast.groupby.map(field_str).join(', '));
	}

	if (ast.orderby) {
		var orderby = ast.orderby.map(ob => ob.order ? field_str(ob) + ' ' + ob.order : field_str(ob)).join(', ');

		// special case: grouping posts by year/month
		if (ast.groupby && ast.groupby.map(field_str).join(', ') == 'EXTRACT(YEAR FROM "post_date"), EXTRACT(MONTH FROM "post_date")' && orderby == '"post_date" DESC')
			orderby = ast.groupby.map(field_str).join(', ');
		if (fields_str == 'EXTRACT(YEAR FROM "post_date") AS "year", EXTRACT(MONTH FROM "post_date") AS "month"' && orderby == '"post_date" DESC')
			orderby = 'EXTRACT(YEAR FROM "post_date") DESC, EXTRACT(MONTH FROM "post_date") DESC';

		parts.push('ORDER BY');
		parts.push(orderby);
	}

	if (ast.limit) {
		if (ast.limit.second)
			parts = parts.concat(['LIMIT', ast.limit.second, 'OFFSET', ast.limit.first]);
		else
			parts = parts.concat(['LIMIT', ast.limit.first]);
	}

	return parts.join(' ') + ';';
}


