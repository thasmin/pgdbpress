SELECT option_name, option_value FROM wp_options WHERE autoload = 'yes'
SELECT option_value FROM wp_options WHERE option_name = 'WPLANG' LIMIT 1
SELECT option_value FROM wp_options WHERE option_name = 'woocommerce_status_options' LIMIT 1
SELECT * FROM wp_users WHERE user_login = 'dan'
SELECT user_id, meta_key, meta_value FROM wp_usermeta WHERE user_id IN (1) ORDER BY umeta_id ASC
SELECT session_value FROM wp_woocommerce_sessions WHERE session_key = '1'
SELECT option_value FROM wp_options WHERE option_name = 'woocommerce_permalinks' LIMIT 1
SELECT * FROM wp_posts WHERE ID = 4 LIMIT 1
SELECT option_value FROM wp_options WHERE option_name = 'woocommerce_lock_down_admin' LIMIT 1
SELECT * FROM wp_posts WHERE ID = 5 LIMIT 1
SELECT option_value FROM wp_options WHERE option_name = 'can_compress_scripts' LIMIT 1
SELECT * FROM wp_posts  WHERE (post_type = 'page' AND post_status = 'publish')     ORDER BY menu_order,wp_posts.post_title ASC
SELECT option_value FROM wp_options WHERE option_name = 'woocommerce_tax_display_cart' LIMIT 1
SELECT   wp_posts.ID FROM wp_posts  WHERE 1=1  AND wp_posts.post_type = 'post' AND ((wp_posts.post_status = 'publish'))  ORDER BY wp_posts.post_date DESC LIMIT 0, 5
SELECT wp_posts.* FROM wp_posts WHERE ID IN (1)
SELECT  t.*, tt.*, tr.object_id FROM wp_terms AS t  INNER JOIN wp_term_taxonomy AS tt ON t.term_id = tt.term_id INNER JOIN wp_term_relationships AS tr ON tr.term_taxonomy_id = tt.term_taxonomy_id WHERE tt.taxonomy IN ('category', 'post_tag', 'post_format') AND tr.object_id IN (1) ORDER BY t.name ASC 
SELECT post_id, meta_key, meta_value FROM wp_postmeta WHERE post_id IN (1) ORDER BY meta_id ASC
SELECT  wp_comments.comment_ID FROM wp_comments JOIN wp_posts ON wp_posts.ID = wp_comments.comment_post_ID WHERE ( comment_approved = '1' ) AND  wp_posts.post_status IN ('publish') AND  wp_posts.post_type NOT IN ('shop_order','shop_order_refund')  AND  wp_posts.post_type <> 'shop_webhook'   ORDER BY wp_comments.comment_date_gmt DESC LIMIT 5
SELECT wp_comments.* FROM wp_comments WHERE comment_ID IN (1)
SELECT comment_id, meta_key, meta_value FROM wp_commentmeta WHERE comment_id IN (1) ORDER BY meta_id ASC
SELECT YEAR(post_date) AS `year`, MONTH(post_date) AS `month`, count(ID) as posts FROM wp_posts  WHERE post_type = 'post' AND post_status = 'publish' GROUP BY YEAR(post_date), MONTH(post_date) ORDER BY post_date DESC 
SELECT  t.*, tt.* FROM wp_terms AS t  INNER JOIN wp_term_taxonomy AS tt ON t.term_id = tt.term_id WHERE tt.taxonomy IN ('category') AND tt.count > 0 ORDER BY t.name ASC 
SELECT term_id, meta_key, meta_value FROM wp_termmeta WHERE term_id IN (1) ORDER BY meta_id ASC
SELECT option_value FROM wp_options WHERE option_name = '_site_transient_update_plugins' LIMIT 1
SELECT option_value FROM wp_options WHERE option_name = '_site_transient_update_themes' LIMIT 1
SELECT option_value FROM wp_options WHERE option_name = '_site_transient_update_core' LIMIT 1
