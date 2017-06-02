'use strict';

var fs         = require('fs')
var translator = require('./translator');
var db         = require('./pool');

/*
var tests = fs.readdirSync('tests').filter(f => f.endsWith('.test')).map(f => 'tests/' + f);
tests.forEach(file => {
	var test_sql = fs.readFileSync(file, 'utf8').split('\n');
	test_sql.pop();
	if (test_sql.length == 1)
		show_conversion(file, test_sql[0]);
	else if (test_sql.length == 2)
		test_conversion(file, test_sql[0], test_sql[1]);
	else if (test_sql.length == 3)
		test_conversion(file, test_sql[0], test_sql[1], JSON.parse(test_sql[2]));
	else {
		console.log(file);
		console.log('invalid test');
	}
});
*/

var config_file = process.argv[2] || './test_config.json';
if (!fs.existsSync(config_file))
	config_file = './config.json';
var config = require(config_file);
db.open(config, config.test_database);
translator.init(db);

var db_tests = fs.readdirSync('tests').filter(f => f.endsWith('.dbtest')).map(f => 'tests/' + f);
db_tests.forEach(file => {
	var test = fs.readFileSync(file, 'utf8').split('\n');
	test = test.filter(l => l.length > 0 && l.substring(0,2) != '--');

	console.log(file);
	if (test.length == 1) {
		console.log(test);
		return;
	}

	var sections = {
		setup: [],
		run: [],
		test: [],
		teardown: [],
	};
	var cur_section = null;
	test.forEach(l => {
		if (l[0] == '.') {
			cur_section = l.substring(1);
			return;
		}
		if (cur_section == null)
			return;
		sections[cur_section].push(l);
	});

	console.log(sections);

	function db_query_no_params(sql) { return db.query(sql, []); }

	// execute setup
	var setups = sections.setup.map(db_query_no_params));
	var chain = setups[0]();
	for (var i = 1; i < setups.length; ++i)
		chain.then(setups[i]);

	// run translated statements
	var runs = sections.setup.map(sql => {
		try {
			var ast = translator.parse_stmt(query);
			if (ast == null)
				throw new Error("unable to create AST");
		} catch (e) {
			console.log();
			console.log('got an error while parsing');
			console.log('query: ' + query);
			console.log(err);
			return conn.writeOk();
		}
		db.query(sql, [])
	});
	var chain = runs[0]();
	for (var i = 1; i < runs.length; ++i)
		chain.then(runs[i]);

	// confirm tests

	// execute teardown
	var teardown = sections.setup.map(db_query_no_params));
	var chain = teardown[0]();
	for (var i = 1; i < teardown.length; ++i)
		chain.then(teardown[i]);

});

function show(file, sql, result, params)
{
	console.log(file);
	console.log(sql);
	console.log(result);
	if (params && params.length > 0)
		console.log(params);
	console.log('---');
}

function show_error(file, sql, err)
{
	console.log(file);
	console.log(sql);
	console.log('error');
	console.log(err);
	console.log('---');
}

function show_conversion(file, sql_my)
{
	var ast = translator.parse_stmt(sql_my, true);
	if (!ast)
		return show(file, sql_my, 'no ast');

	var sql_p = translator.ast_to_pgsql(ast);
	if (!sql_p)
		return show(file, sql_my, 'unable to translate');

	sql_p
		.then(result => show(file, sql_my, result[0], result[1]))
		.catch(e => show_error(file, sql_my, e));
}

function test_conversion(file, sql_my, sql_pg, params)
{
	var ast = translator.parse_stmt(sql_my, true);
	if (!ast)
		return show(file, sql_my, 'no ast');

	var sql_p = translator.ast_to_pgsql(ast);
	if (!sql_p)
		return show(file, sql_my, 'unable to translate');

	sql_p
		.then(result => {
			result[1] = result[1] || [];
			params = params || [];

			var sql_wrong = (result[0] != sql_pg);
			var params_wrong = (result[1].length != params.length) || !result[1].every((el, index) => el == params[index]);
			if (sql_wrong || params_wrong) {
				console.log(file);
				if (sql_wrong) {
					console.log(result[0]);
					console.log(sql_pg);
				}
				if (params_wrong) {
					console.log(result[1]);
					console.log(params);
				}
				console.log('---');
			}
		})
		.catch(e => show_error(file, sql_my, e));
}
