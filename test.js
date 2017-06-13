'use strict';

var process    = require('process');
var fs         = require('fs')
var translator = require('./translator');
var db         = require('./pool');

//test_stmt("show index from wp_users WHERE column_name = 'user_email' and key_name = 'wp_users_user_email'");
//test_stmt("SHOW INDEX FROM wp_woocommerce_sessions");
//test_stmt("SELECT * FROM wp_posts WHERE ID = -1 LIMIT 1");
//test_stmt("SELECT term_id FROM wp_terms as t WHERE t.slug = 'simple' ORDER BY t.term_id ASC LIMIT 1");
//test_stmt("ALTER TABLE wp_woocommerce_sessions CHANGE COLUMN `session_id` session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT");
//test_stmt("ALTER TABLE wp_woocommerce_sessions CHANGE COLUMN `session_key` session_key char(32) NOT NULL");
//test_stmt("ALTER TABLE wp_woocommerce_sessions ADD PRIMARY KEY  (`session_key`)");
//test_stmt("ALTER TABLE wp_woocommerce_sessions ADD UNIQUE KEY `session_id` (`session_id`)");
//test_stmt("ALTER TABLE wp_woocommerce_order_items ALTER COLUMN `order_item_type` SET DEFAULT ''");
//test_stmt("ALTER TABLE wp_woocommerce_order_items ALTER COLUMN `order_item_type` DROP DEFAULT");
//test_stmt("ALTER TABLE wp_woocommerce_tax_rates ADD KEY `tax_rate_class` (`tax_rate_class`(10))");
//test_stmt("ALTER TABLE wp_comments ADD INDEX woo_idx_comment_type (comment_type)");
//test_stmt("ALTER TABLE wp_woocommerce_downloadable_product_permissions DROP PRIMARY KEY, ADD `permission_id` BIGINT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT");
//test_stmt("SHOW COLUMNS FROM `wp_woocommerce_downloadable_product_permissions` LIKE 'permission_id'");
//test_stmt("SHOW FULL COLUMNS FROM `wp_woocommerce_downloadable_product_permissions`");
test_stmt("ALTER TABLE wp_woocommerce_payment_tokenmeta ADD PRIMARY KEY  (`meta_id`)");

function test_stmt(stmt, match)
{
	var ast = translator.parse_stmt(stmt, true);
	if (!ast)
		return;

	var sql_p = translator.ast_to_pgsql(ast);
	if (!sql_p)
		return;

	sql_p.then(result => {
		console.log(stmt);
		//console.log(ast);
		console.log('---');
		console.log(result[0]);
		if (result[1].length > 0)
			console.log(result[1]);
		if (match) {
			console.log(match);
			console.log(result[0] == match ? 'success' : 'no match');
		}
		/*
		db.query(result[0], result[1])
			.then((res) => { console.log('success in db'); })
			.catch((e) => { console.log('error in db'); console.log(e); });
		*/
		console.log('===');
		console.log();
	}).catch(e => {
		console.log(stmt);
		console.log('error');
		console.log(e);
		console.log('===');
	});
}

