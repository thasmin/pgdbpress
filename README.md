# PGdb Press
This is a MySQL proxy server that runs its commands on PostgreSQL. For most applications, this would not be the best solution. If you are using MySQL and want to use PostgreSQL, change the code so it uses PostgreSQL. This isn't always possible. Sometimes you don't control the code.

There is one huge application that solely uses MySQL: Wordpress.

## Maturity
This project is extremely immature. Among other things, it lacks proper configuration and provides no authentication.

## How It Works
PGdb Press works by acting like a MySQL server, listening for queries and returning data. When it receives a query, the SQL statement is parsed and converted to data. An equivalent SQL statement is created from that data and sent to PostgreSQL. The data is received from PostgreSQL and sent back to the application using the MySQL protocol.

It is written in Javascript and run with Node.JS. This was chosen because of the available libraries and speed of development. Future versions of PGdb Press may be written in another language. It primarily relies on the mysql2, pg, and peg-js libraries.
- mysql2: Communicates to clients via the MySQL protocol. This module made it easy to listen as a MySQL server.
- pg: Communicates to PostgreSQL to retrieve data.
- pegjs: A Parsing Expression Grammar library that parses the query. PEG parsers are more powerful than traditional parsers, although the approach that PGdb Press uses may not be taking advantage of any of that power.

## Challenges

### SQL grammar
The grammar rules are in sql.pegjs. The parser is not complete, although it currently works for everything in vanilla Wordpress. Attempts were made to use the bison-based parser in the MySQL code as well as use the MySQL-proxy project.

### MySQL Features Not In PostgreSQL
This project would have been more difficult if it were attempting to use MySQL data in PostgreSQL. MySQL has relatively few features that are not found in PostgreSQL. Some features are similar enough that they required only a translation, such as converting REGEXP to SIMILAR TO. However, some features were more difficult:
- Multi table deletes: MySQL has the ability to delete from multiple tables at one time using a syntax like _DELETE a,b FROM table1 a, table2 b WHERE a._id_ = b.table2_id_. There was only one place in vanilla Wordpress where this feature is used and PGdb Press only handles it properly in that one case. Improvements may be required for plugins that use this feature. The solution was to run intermediate queries to get the primary keys of those fields, figure out which data is going to be deleted, then delete that data using the primary key. Deleting data from tables sequentially was not an option because of the unknown relationships between the data.
- Case sensitivity: PostgreSQL uses all lowercase field names. Wordpress turns field names into object properties which are case sensitive and will crash if it doesn't exist. The solution is to use double quotes for all field names when creating and selecting data. PGdb Press handles this properly.
- Using parameters: PGdb Press receives queries in all text, but parameters are necessary for handling strings with single quotes in them.
- SQL_CALC_FOUND_ROWS and FOUND_ROWS(): MySQL uses this to determine the full number of rows when including a LIMIT clause. PGdb Press needs to modify the query to include an additional column OVER() and then caches that value for when another query requests the FOUND_ROWS() column.
- DESCRIBE and SHOW statements: MySQL has easy ways to determine the structure of a table. Wordpress uses these statements often. PGdb Press uses PostgreSQL system tables to supply this data.
- UPSERTS: MySQL has a ON DUPLICATE KEY clause that allows an INSERT statement to UPDATE rows if the new data causes problems with constraints like unique keys. PostgreSQL has a similar feature ON CONFLICT DO UPDATE but the names of the fields in the unique key must be specified. PGdb Press uses PostgreSQL system tables to find the fields in a unique key on the relevant table and uses that. This is imperfect because there may be multiple unique keys, but it works for the limited use cases in Wordpress.

## License
The current license is GPL3. This is probably overly restrictive for this type of application. It will probably change in the future. Please feel free to email me or open an issue regarding the license.

Wordpress is GPL2 or newer and so anything that is built on top of Wordpress needs to use that license. I don't believe this requirement applies to PGdb Press since there is no usage of Wordpress code anywhere.
