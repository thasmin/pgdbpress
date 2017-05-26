start = 
	ws* s:(select_stmt / create_stmt / insert_stmt / update_stmt /
			delete_single_table_stmt / delete_multi_table_stmt /
			set_stmt / describe_stmt /
			show_tables_stmt / show_databases_stmt / show_full_columns_stmt
		  ) ws* ";"?
	{ return s }

show_full_columns_stmt = "SHOW"i ws+ "FULL"i ws+ "COLUMNS"i ws+ "FROM"i ws+ t:field { return { expr:'SHOW', obj:'FULL COLUMNS', table:t } }

show_databases_stmt = "SHOW"i ws+ "DATABASES"i { return { expr:'SHOW', obj:'DATABASES' } }

show_tables_stmt = "SHOW"i ws+ "TABLES"i e:show_tables_like_or_where? { return { expr:'SHOW', obj:'TABLES', cond:e } }
show_tables_like_or_where =
	ws+ "LIKE"i ws+ l:literal { return { oper:'LIKE', value:l } }
  / ws+ "WHERE"i ws+ e:where_expression { return { oper:'WHERE', expr:e } }

describe_stmt = "DESCRIBE"i ws+ t:ident { return { expr:'SHOW', obj:'COLUMNS', table:t } }

set_stmt = "SET"i ws+ k:ident ws+ v:.* { return { expr:'SET', key:k, value:v.join('')} }

delete_multi_table_stmt = "DELETE"i ws+ tl:ident_list a:from_clause w:where_clause
	{
		return {
			expr:'DELETE',
			tables:tl,
			aliases:a,
			where:w,
		}
	}

delete_single_table_stmt = "DELETE"i ws+ "FROM"i ws+ t:field w:where_clause
	{
		return {
			expr:'DELETE',
			table:t,
			where:w,
		}
	}

update_stmt = "UPDATE"i ws+ t:field ws+ "SET"i ws+ f1:update_clause f2:update_clause2* w:where_clause
	{
		return {
			expr:'UPDATE',
			table:t,
			changes:[f1].concat(f2),
			where:w,
		}
	}
update_clause = f:field ws* "=" ws* v:field_or_literal_or_nullable { return { field:f, value:v } }
update_clause2 = ws* "," ws* uc:update_clause { return uc }

insert_stmt = "INSERT" ws+ ig:ignore_clause? "INTO"i ws+ t:field ws* "(" ws* f:field_list ws* ")" ws+ "VALUES"i ws* v1:values_clause v2:values_clause2* odk:on_dupe_key_clause?
	{
		return {
			expr:'INSERT',
			ignore:!!ig,
			table:t,
			fields:f,
			values:[v1].concat(v2),
			on_dupe_key:odk,
		}
	}

ignore_clause = "IGNORE"i ws+
values_clause = "(" ws* v:list ws* ")" { return v }
values_clause2 = ws* "," ws* v:values_clause { return v }
on_dupe_key_clause = ws+ "ON DUPLICATE KEY UPDATE"i ws+ f1:on_dupe_key_part f2:on_dupe_key_part2* { return [f1].concat(f2) }
on_dupe_key_part = f:field ws* "=" ws* "VALUES" ws* "(" ws* v:field_or_literal_or_nullable ws* ")" { return { field:f, value:v } }
on_dupe_key_part2 = ws* "," ws* p:on_dupe_key_part { return p }

create_stmt = "CREATE"i ws* rep:("OR REPLACE"i ws)? temp:("TEMPORARY"i ws)? "TABLE"i ws ifn:("IF NOT EXISTS"i ws)? t:ident ws*
	def:create_stmt_def_or_select char:create_default_character? coll:create_collation?
	{
		return {
			expr:'CREATE',
			or_replace:(rep != null),
			temporary:(temp != null),
			if_not_exists:(ifn != null),
			table:t,
			def:def,
			charset:char,
			collation:coll,
		}
	}

create_stmt_def_or_select = create_stmt_fields / "(" ws* s:select_stmt ws* ")" { return s }
create_stmt_fields = "(" f:create_field_def g:create_field_comma_def* k:create_field_keys* ")" 
	{ return { fields:[f].concat(g), keys:k } }

create_field_comma_def = "," ws* f:create_field_def { return f }
create_field_def = ws* n:ident ws d:create_column_def ws* { var obj = {name:n}; Object.assign(obj, d); return obj; }
create_column_def = d:datatype o:create_column_opt* ws*
	{
		var uppers = o.map(s => s.toUpperCase().replace("_", ""));
		var defAt = o.find(u => u.toUpperCase().startsWith('DEFAULT '));
		var def = defAt && defAt.substr(8);
		return {
			datatype:d,
			can_be_null:!uppers.includes("NOT NULL"),
			auto_increment:uppers.includes("AUTOINCREMENT"),
			default:def
		};
	}

create_field_key = unique_key_field / primary_key_field / regular_key_field
create_field_keys = "," ws* k:create_field_key ws* { return k }
unique_key_field = ws* "UNIQUE KEY"i ws+ n:field ws+ "(" l:key_field_list ")" { return { type:'UNIQUE', name:n.ident, fields:l } }
primary_key_field = ws* "PRIMARY KEY"i ws+ "(" l:key_field_list ")" { return { type:'PRIMARY', fields:l } }
regular_key_field = ws* "KEY"i ws+ n:field ws+ "(" l:key_field_list ")" { return { type:'INDEX', name:n.ident, fields:l } }

key_field = f:field s:dt_size? { return { field:f.ident, size:s } }
key_field_comma = "," ws* k:key_field ws* { return k }
key_field_list = l:key_field k:key_field_comma* { return [l].concat(k) }

create_default_character = ws+ "DEFAULT CHARACTER SET "i c:charset { return c }
create_collation = ws+ "COLLATE "i c:collation { return c }
//charset = "latin1"i / "utf8"i / "utf8mb4"i
//collation = "latin1_swedish_ci"i / "utf8_general_ci"i / "utf8mb4_unicode_520_ci"i

create_column_opt_ai = "AUTOINCREMENT"i / "AUTO_INCREMENT"i
create_column_opt_default = d:"DEFAULT"i ws+ t:literal_or_nullable { return "DEFAULT " + t }
create_column_opt = ws* s:(nullable / create_column_opt_ai / create_column_opt_default) { return s }

dt_size = "(" s:[0-9]+ ")" { return s.join('') }
dt_int_mod = ws* m:("UNSIGNED"i / "ZEROFILL"i) { return m }
datatype = "BIT"i dt_size? /
	"VARCHAR"i s:dt_size? { return { type:'VARCHAR', size:s } } /
	"CHAR"i s:dt_size? { return { type:'CHAR', size:s } } /
	"BINARY"i s:dt_size? { return { type:'BINARY', size:s } } /
	"CHAR BYTE"i s:dt_size? { return { type:'CHAR BYTE', size:s } } /
	"VARBINARY"i s:dt_size? { return { type:'VARBINARY', size:s } } /
	"BLOB"i /
	"TINYBLOB"i /
	"MEDIUMBLOB"i /
	"LONGBLOB"i /
	"TEXT"i /
	"TINYTEXT"i /
	"MEDIUMTEXT"i /
	"LONGTEXT"i /
	"ENUM"i /
	"SET"i /
	"DATETIME"i /
	"DATE"i /
	"TIME"i /
	"TIMESTAMP"i /
	"YEAR"i /
	"BOOLEAN"i /
	"BOOL"i /
	"INTEGER"i s:dt_size? { return { type:'INTEGER', size:s } } /
	"TINYINT"i s:dt_size? { return { type:'TINYINT', size:s } } /
	"SMALLINT"i s:dt_size? { return { type:'SMALLINT', size:s } } /
	"MEDIUMINT"i s:dt_size? { return { type:'MEDIUMINT', size:s } } /
	"INT"i s:dt_size? { return { type:'INT', size:s } } /
	"BIGINT"i s:dt_size? m:dt_int_mod* { return { type:'BIGINT', size:s, mods:m } } /
	"DECIMAL"i /
	"DEC"i /
	"NUMERIC"i /
	"FIXED"i /
	"FLOAT"i /
	"DOUBLE PRECISION"i /
	"DOUBLE"i

select_stmt = full_select_stmt / simple_select_stmt
simple_select_stmt = 
	"SELECT"i ws+ scfr:sql_calc_found_rows? dist:distinct? f:select_fields
	{ return { expr:'SELECT', calc_found_rows:!!scfr, distinct:!!dist, fields:f, from:null, join:null, where:null, groupby:null, orderby:null, limit:null } }
full_select_stmt =
	"SELECT"i ws+ scfr:sql_calc_found_rows? dist:distinct? f:select_fields
	fr:from_clause?
	j:join_clause*
	w:where_clause?
	g:group_by_clause?
	o:order_by_clause?
	l:limit_clause?
	{ return { expr:'SELECT', calc_found_rows:!!scfr, distinct:!!dist, fields:f, from:fr, join:j, where:w, groupby:g, orderby:o, limit:l } }

select_fields = f:select_field g:select_field2* { return [f].concat(g) }
select_field =
	f:select_field_noalias ws+ "AS"i ws+ i:field { f.alias = i; return f; }
  / select_field_noalias
select_field2 = "," ws* f:select_field { return f }
select_field_noalias =
	"*"
  / e:where_expression { return e }
  / s:special_field { return {ident:s} }
  / a:fn_name ws* "(" ws* f:select_field f2:select_field2* ws* ")" { return { fn:a, args:[f].concat(f2) } }
  / t:ident ".*" { return {table:t, ident:'*'} }
  / f:field { return f }

sql_calc_found_rows = "SQL_CALC_FOUND_ROWS"i ws+ { return true }
distinct = "DISTINCT"i ws+ { return true }
fn_name = "MAX"i / "SUM"i / "AVERAGE"i / "COUNT"i /
	"YEAR"i / "MONTH"i / "DAY"i /
	"CONCAT"i / "SUBSTRING"i /
	"NULLIF"i
special_field = "@@[a-zA-Z_]+" / "DATABASE()"i / "FOUND_ROWS()"i

keyword = "LIMIT"i / "ORDER"i / "GROUP"i / "WHERE"i / "JOIN"i / "ON"i
from_clause = ws+ "FROM"i ws+ t1:aliasable_table t2:aliasable_table2* { return [t1].concat(t2) }
aliasable_table =
	t:field ws+ "AS" ws+ !keyword a:ident { t.alias = a; return t; }
  / t:field ws+ !keyword a:ident { t.alias = a; return t; }
  / field
aliasable_table2 = ws* "," ws* t:aliasable_table { return t }

join_type = j:("LEFT"i / "RIGHT"i / "OUTER"i / "INNER"i) ws+ { return j }
join_clause = ws+ h:join_type? "JOIN"i ws+ t:aliasable_table ws "ON"i ws e:where_expression
	{ return {type:h, table:t, expr:e} }

where_clause = ws+ "WHERE"i ws+ w1:where_expression w2:where_expression2* { return [w1].concat(w2) }
where_expression =
	f:field_or_literal_or_nullable ws* o:operator_and_value { return { field:f, oper:o.oper, value:o.value } }
  / "(" ws* w1:where_expression w2:where_expression2* ws* ")" { return [w1].concat(w2) }
where_expression2 = ws+ c:("AND"i / "OR"i) ws+ e:where_expression { return { combiner:c, expr:e } }
operator_binary = "=" / "<>" / "!=" / "<" / ">" / "REGEXP"i / "LIKE"i / "NOT LIKE"i
operator_list = "IN"i / "NOT IN"i
operator_and_value = o:operator_binary ws* v:field_or_literal_or_nullable { return { oper:o, value:v } } /
					 o:operator_list ws* "(" ws* n:list ")" { return { oper:o, value:n } }

group_by_clause = ws+ "GROUP BY"i ws+ f:fn_field_list { return f }

order_by_clause = ws+ "ORDER BY"i ws+ f:sort_fn_field_list { return f }

limit_clause =
	ws+ "LIMIT"i ws+ n:number ws* "," ws* m:number { return { first:n, second:m } }
  / ws+ "LIMIT"i ws+ n:number { return { first:n } }



ws = (ws_chars / multiline_comment)+
ws_chars = [ \t\n\r]+
multiline_comment = "/*" ([^*]*)? multiline_comment2*
multiline_comment2 = "*/" / "*" [^*]+

number = n:[0-9]+ { return parseInt(n.join(''), 10) }
number_comma = "," ws* n:number { return n }
number_list = n:number ws* c:number_comma* { return [n].concat(c) }

literal = "'" l:$[^\\']* es:escaped_quote_clause* "'" { return "'" + l + es.join('') + "'" }
escaped_quote_clause = "\\" s:. l:$[^\\']* { return s + l }

nullable = "NULL"i / "NOT NULL"i
literal_or_nullable = literal / number / nullable
field_or_literal_or_nullable = fn_field / literal_or_nullable
field_or_literal_or_nullable2 = ws* "," ws* f:field_or_literal_or_nullable ws* { return f }

list = f:field_or_literal_or_nullable g:field_or_literal_or_nullable2* { return [f].concat(g) }

ident = h:[@a-zA-Z_] t:[@a-zA-Z0-9_]* { return [h].concat(t).join('') }
ident2 = "," ws* f:ident { return f }
ident_list = f:ident g:ident2* { return [f].concat(g) }

field = "`" f:field_inner "`" { return f } / field_inner
field_inner = 
	t:ident "." i:ident { return {table:t, ident:i} }
  / i:ident { return {ident:i} }
field2 = "," ws* f:field { return f }
field_list = f:field g:field2* { return [f].concat(g) }

fn_field =
	fn:fn_name ws* "(" ws* l:list ws* ")" { return { fn:fn, args:l } }
  / field
fn_field2 = "," ws* f:fn_field { return f }
fn_field_list = h:fn_field t:fn_field2* { return [h].concat(t) }

sort_order = ws+ o:( "ASC"i / "DESC"i ) { return o }
sort_fn_field = f:fn_field o:sort_order? { return Object.assign(f, { order:o }) }
sort_fn_field2 = "," ws* f:sort_fn_field { return f }
sort_fn_field_list = h:sort_fn_field t:sort_fn_field2* { return [h].concat(t) }

charset = "big5"i / "dec8"i / "cp850"i / "hp8"i / "koi8r"i / "latin1"i / "latin2"i / "swe7"i / 
"ascii"i / "ujis"i / "sjis"i / "hebrew"i / "tis620"i / "euckr"i / "koi8u"i / "gb2312"i / "greek"i / 
"cp1250"i / "gbk"i / "latin5"i / "armscii8"i / "utf8mb4"i / "utf8"i / "ucs2"i / "cp866"i / "keybcs2"i / 
"macce"i / "macroman"i / "cp852"i / "latin7"i / "cp1251"i / "utf16"i / "utf16le"i / 
"cp1256"i / "cp1257"i / "utf32"i / "binary"i / "geostd8"i / "cp932"i / "eucjpms"i

collation =
	c:charset "_" l:$[a-zA-Z]+ "_520_ci"i { return c + "_" + l + "_520_ci"; }
  / c:charset "_" l:$[a-zA-Z]+ "_ci"i { return c + "_" + l + "_ci"; }
  / c:charset "_bin"i { return c + "_bin" }
  / "binary"i
/*
"big5_chinese_ci"i / "big5_bin"i / 
"dec8_swedish_ci"i / "dec8_bin"i / 
"cp850_general_ci"i / "cp850_bin"i / 
"hp8_english_ci"i / "hp8_bin"i / 
"koi8r_general_ci"i / "koi8r_bin"i / 
"latin1_german1_ci"i / "latin1_swedish_ci"i / "latin1_danish_ci"i / "latin1_german2_ci"i / 
"latin1_bin"i / "latin1_general_ci"i / "latin1_general_cs"i / "latin1_spanish_ci"i / 
"latin2_czech_cs"i / "latin2_general_ci"i / "latin2_hungarian_ci"i / "latin2_croatian_ci"i / "latin2_bin"i / 
"swe7_swedish_ci"i / "swe7_bin"i / 
"ascii_general_ci"i / "ascii_bin"i / 
"ujis_japanese_ci"i / "ujis_bin"i / 
"sjis_japanese_ci"i / "sjis_bin"i / 
"hebrew_general_ci"i / "hebrew_bin"i / 
"tis620_thai_ci"i / "tis620_bin"i / 
"euckr_korean_ci"i / "euckr_bin"i / 
"koi8u_general_ci"i / "koi8u_bin"i / 
"gb2312_chinese_ci"i / "gb2312_bin"i / 
"greek_general_ci"i / "greek_bin"i / 
"cp1250_general_ci"i / "cp1250_czech_cs"i / "cp1250_croatian_ci"i / "cp1250_bin"i / "cp1250_polish_ci"i / 
"gbk_chinese_ci"i / "gbk_bin"i / 
"latin5_turkish_ci"i / "latin5_bin"i / 
"armscii8_general_ci"i / "armscii8_bin"i / 
"utf8_general_ci"i / "utf8_bin"i / "utf8_unicode_ci"i / "utf8_icelandic_ci"i / "utf8_latvian_ci"i / 
"utf8_romanian_ci"i / "utf8_slovenian_ci"i / "utf8_polish_ci"i / "utf8_estonian_ci"i / "utf8_spanish_ci"i / 
"utf8_swedish_ci"i / "utf8_turkish_ci"i / "utf8_czech_ci"i / "utf8_danish_ci"i / "utf8_lithuanian_ci"i / 
"utf8_slovak_ci"i / "utf8_spanish2_ci"i / "utf8_roman_ci"i / "utf8_persian_ci"i / "utf8_esperanto_ci"i / 
"utf8_hungarian_ci"i / "utf8_sinhala_ci"i / "utf8_german2_ci"i / "utf8_croatian_mysql561_ci"i / 
"utf8_unicode_520_ci"i / "utf8_vietnamese_ci"i / "utf8_general_mysql500_ci"i / "utf8_croatian_ci"i / 
"utf8_myanmar_ci"i / "utf8_thai_520_w2"i / 
"ucs2_general_ci"i / "ucs2_bin"i / "ucs2_unicode_ci"i / "ucs2_icelandic_ci"i / "ucs2_latvian_ci"i / 
"ucs2_romanian_ci"i / "ucs2_slovenian_ci"i / "ucs2_polish_ci"i / "ucs2_estonian_ci"i / "ucs2_spanish_ci"i / 
"ucs2_swedish_ci"i / "ucs2_turkish_ci"i / "ucs2_czech_ci"i / "ucs2_danish_ci"i / "ucs2_lithuanian_ci"i / 
"ucs2_slovak_ci"i / "ucs2_spanish2_ci"i / "ucs2_roman_ci"i / "ucs2_persian_ci"i / "ucs2_esperanto_ci"i / 
"ucs2_hungarian_ci"i / "ucs2_sinhala_ci"i / "ucs2_german2_ci"i / "ucs2_croatian_mysql561_ci"i / 
"ucs2_unicode_520_ci"i / "ucs2_vietnamese_ci"i / "ucs2_general_mysql500_ci"i / "ucs2_croatian_ci"i / 
"ucs2_myanmar_ci"i / "ucs2_thai_520_w2"i / 
"cp866_general_ci"i / "cp866_bin"i / 
"keybcs2_general_ci"i / "keybcs2_bin"i / 
"macce_general_ci"i / "macce_bin"i / 
"macroman_general_ci"i / "macroman_bin"i / 
"cp852_general_ci"i / "cp852_bin"i / 
"latin7_estonian_cs"i / "latin7_general_ci"i / "latin7_general_cs"i / "latin7_bin"i / 
"utf8mb4_general_ci"i / "utf8mb4_bin"i / "utf8mb4_unicode_ci"i / "utf8mb4_icelandic_ci"i / "utf8mb4_latvian_ci"i / 
"utf8mb4_romanian_ci"i / "utf8mb4_slovenian_ci"i / "utf8mb4_polish_ci"i / "utf8mb4_estonian_ci"i / 
"utf8mb4_spanish_ci"i / "utf8mb4_swedish_ci"i / "utf8mb4_turkish_ci"i / "utf8mb4_czech_ci"i / 
"utf8mb4_danish_ci"i / "utf8mb4_lithuanian_ci"i / "utf8mb4_slovak_ci"i / "utf8mb4_spanish2_ci"i / 
"utf8mb4_roman_ci"i / "utf8mb4_persian_ci"i / "utf8mb4_esperanto_ci"i / "utf8mb4_hungarian_ci"i / 
"utf8mb4_sinhala_ci"i / "utf8mb4_german2_ci"i / "utf8mb4_croatian_mysql561_ci"i / "utf8mb4_unicode_520_ci"i / 
"utf8mb4_vietnamese_ci"i / "utf8mb4_croatian_ci"i / "utf8mb4_myanmar_ci"i / "utf8mb4_thai_520_w2"i / 
"cp1251_bulgarian_ci"i / "cp1251_ukrainian_ci"i / "cp1251_bin"i / "cp1251_general_ci"i / "cp1251_general_cs"i / 
"utf16_general_ci"i / "utf16_bin"i / "utf16_unicode_ci"i / "utf16_icelandic_ci"i / "utf16_latvian_ci"i / 
"utf16_romanian_ci"i / "utf16_slovenian_ci"i / "utf16_polish_ci"i / "utf16_estonian_ci"i / "utf16_spanish_ci"i / 
"utf16_swedish_ci"i / "utf16_turkish_ci"i / "utf16_czech_ci"i / "utf16_danish_ci"i / "utf16_lithuanian_ci"i / 
"utf16_slovak_ci"i / "utf16_spanish2_ci"i / "utf16_roman_ci"i / "utf16_persian_ci"i / "utf16_esperanto_ci"i / 
"utf16_hungarian_ci"i / "utf16_sinhala_ci"i / "utf16_german2_ci"i / "utf16_croatian_mysql561_ci"i / 
"utf16_unicode_520_ci"i / "utf16_vietnamese_ci"i / "utf16_croatian_ci"i / "utf16_myanmar_ci"i / "utf16_thai_520_w2"i / 
"utf16le_general_ci"i / "utf16le_bin"i / 
"cp1256_general_ci"i / "cp1256_bin"i / "cp1257_lithuanian_ci"i / 
"cp1257_bin"i / "cp1257_general_ci"i / "utf32_general_ci"i / 
"utf32_bin"i / "utf32_unicode_ci"i / "utf32_icelandic_ci"i / "utf32_latvian_ci"i / "utf32_romanian_ci"i / 
"utf32_slovenian_ci"i / "utf32_polish_ci"i / "utf32_estonian_ci"i / "utf32_spanish_ci"i / "utf32_swedish_ci"i / 
"utf32_turkish_ci"i / "utf32_czech_ci"i / "utf32_danish_ci"i / "utf32_lithuanian_ci"i / "utf32_slovak_ci"i / 
"utf32_spanish2_ci"i / "utf32_roman_ci"i / "utf32_persian_ci"i / "utf32_esperanto_ci"i / "utf32_hungarian_ci"i / 
"utf32_sinhala_ci"i / "utf32_german2_ci"i / "utf32_croatian_mysql561_ci"i / "utf32_unicode_520_ci"i / 
"utf32_vietnamese_ci"i / "utf32_croatian_ci"i / "utf32_myanmar_ci"i / "utf32_thai_520_w2"i / 
"binary"i / 
"geostd8_general_ci"i / "geostd8_bin"i / 
"cp932_japanese_ci"i / "cp932_bin"i / 
"eucjpms_japanese_ci"i / "eucjpms_bin"i / 
*/
