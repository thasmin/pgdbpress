'use strict';

var fs         = require('fs')
var translator = require('./translator');
var db         = require('./pool');

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

var config_file = process.argv[2] || './test_config.json';
if (!fs.existsSync(config_file))
	config_file = './config.json';
var config = require(config_file);
db.open(config, config.test_database);
translator.init(db);

var db_tests = fs.readdirSync('tests').filter(f => f.endsWith('.dbtest')).map(f => 'tests/' + f);
var db_promise = db_tests.reduce(
	(promise, file) => promise.then(() => { return run_db_test(file); }).catch(e => show_db_error(file, e)),
	Promise.resolve()
);
db_promise.then(() => process.exit(0));

function show_db_error(file, err)
{
	if (err.then)
		err.then(e => console.log(file + ": " + e.reason));
	else
		console.log(file + ": " + err);
}

function run_db_test(file)
{
	//console.log('running ' + file);
	return new Promise((resolve, reject) => {
		var test = fs.readFileSync(file, 'utf8').split('\n');
		test = test.filter(l => l.length > 0 && l.substring(0,2) != '--');

		if (test.length == 1)
			return reject('incomplete db test');

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

		run_section(sections.setup)
			.then(() => translate_section(sections.run))
			.then(() => test_section(sections.test))
			.then(() => run_section(sections.teardown))
			.then(resolve)
			.catch(e => {
				run_section(sections.teardown);
				reject(e);
			});
	});
}

function db_query(sql)
{
	//console.log('running ' + sql);
	return db.query(sql, []);
 }

function run_section(sqls)
{
	//console.log('running a section');
	return sqls.reduce(
		(acc, sql) => acc.then(() => db_query(sql)),
		Promise.resolve()
	);
}

function db_translate(sql)
{
	//console.log('translating ' + sql);
	return translator.translate(sql);
 }

function translate_section(sqls)
{
	//console.log('translating a section');
	return sqls.reduce(
		(acc, sql) => acc.then(() => db_translate(sql)),
		Promise.resolve()
	);
}

function array_equals(a1, a2)
{
	return a1.length == a2.length && a1.every((el, i) => el == a2[i]);
}

function match_sql(sql, match) {
	return new Promise((resolve, reject) => {
		//console.log('matching sql: ' + sql);
		translator.translate(sql, []).then(result => {
			//console.log(result);
			if (result.result != 'rowset')
				reject('tests need to return rowsets');
			if (result.rows.length != match.length)
				reject('incorrect number of rows');
			for (var i = 0; i < result.rows.length; ++i)
				if (!array_equals(result.rows[i], match))
					reject('row ' + i + ' is different');
			resolve();
		}).catch(reject);
	});
}

function test_section(sqls_matches) {
	//console.log('matching a section');
	var sqls = sqls_matches.filter((el, i) => i % 2 == 0);
	var matches = sqls_matches.filter((el, i) => i % 2 == 1);
	matches = matches.map(JSON.parse);
	var promises = sqls.map((sql, i) => match_sql(sql, matches[i]));
	return Promise.all(promises);
}


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
