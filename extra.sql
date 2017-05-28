DELETE a, b FROM wp_options a, wp_options b WHERE a.option_name LIKE '\\_transient\\_%' AND a.option_name NOT LIKE '\\_transient\\_timeout\\_%' AND b.option_name = CONCAT( '_transient_timeout_', SUBSTRING( a.option_name, 12 ) ) AND b.option_value < 1494171210
DELETE FROM wp_options WHERE option_name SIMILAR TO '^rss_[0-9a-f]{32}(_ts)?$'
INSERT INTO `wp_options` (`option_name`, `option_value`) VALUES ('fresh_site', '1') ON DUPLICATE KEY UPDATE `option_name` = VALUES(`option_name`), `option_value` = VALUES(`option_value`)
SHOW FULL COLUMNS FROM `wp_options`
UPDATE `wp_options` SET `option_value` = 'Translator' WHERE `option_name` = 'blogname'
INSERT INTO test(name) VALUES('single\'quote')
INSERT INTO table (c1, c2, c3) VALUES ('v1', 2, 'v3'), ('v4', 5, 'v6'), ('v7', 8, 'v9')
DESCRIBE table
SELECT YEAR(post_date) AS `year`, MONTH(post_date) AS `month`, count(ID) as posts FROM wp_posts WHERE post_type = 'post' AND post_status = 'publish' GROUP BY YEAR(post_date), MONTH(post_date) ORDER BY post_date DESC -- should change orderby to match groupby
SELECT p.ID, post_status, p.* FROM wp_posts p
CREATE TABLE table(c varchar(50) NOT NULL default 'lowercase')
INSERT IGNORE INTO `wp_options` ( `option_name`, `option_value`, `autoload` ) VALUES ('auto_updater.lock', '1495799924', 'no') /* LOCK */
/**/ /*   */ SELECT /* * */ f FROM /* *a */ t
SELECT COUNT( 1 ) FROM wp_posts WHERE post_type = 'post' AND post_status NOT IN ( 'trash','auto-draft','inherit' ) AND post_author = 1
SELECT comment_post_ID, COUNT(comment_ID) as num_comments FROM wp_comments WHERE comment_post_ID IN ( '1' ) AND comment_approved = '0' GROUP BY comment_post_ID
SELECT DISTINCT YEAR( post_date ) AS year, MONTH( post_date ) AS month FROM wp_posts WHERE post_type = 'post' AND post_status != 'auto-draft' AND post_status != 'trash' ORDER BY post_date DESC
SELECT wp_users.ID,wp_users.user_login,wp_users.display_name FROM wp_users INNER JOIN wp_usermeta ON ( wp_users.ID = wp_usermeta.user_id ) WHERE 1=1 AND ( ( wp_usermeta.meta_key = 'wp_user_level' AND wp_usermeta.meta_value != '0' )) ORDER BY display_name ASC
SELECT wp_term_taxonomy.term_id FROM wp_term_taxonomy INNER JOIN wp_terms USING (term_id) WHERE taxonomy = 'category' AND wp_terms.slug IN ('uncategorized')
