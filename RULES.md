# The Vitti SQL indentation style

A reverse-engineered, human-readable spec of the formatting style used across the
`exemplos_scripts/` corpus (47 scripts). This is the contract the auto-formatter
implements. Tab width is **4**; indentation and all alignment use **real tab
characters** (never spaces).

---

## 1. Casing
- **Reserved keywords are lowercase**: `select`, `from`, `left join`, `inner join`,
  `on`, `where`, `and`, `or`, `group by`, `having`, `order by`, `insert into`,
  `update`, `set`, `with`, `as`, `case when then else end`, `union all`, etc.
- **Built-in functions are lowercase**: `sum`, `count`, `isnull`/`coalesce`,
  `row_number`, `over`, `getdate`, `cast`, `min`, `max`, `datediff`.
- **Identifiers keep their original case** — schema/table/column names are never
  re-cased (`BASE_ANALYTICS.vs.usage`, `customer_nrc`, `[BREDT1-CLBDDP19]`).

## 2. The "river" (the defining rule)
Every clause keyword sits flush in a **left keyword column**; its operand starts at a
**fixed tab stop, column 12** (3 tab stops at tab-width 4), forming a clean vertical
river. The keyword and its first operand share one line.

```
select      first_expression                alias
            ,second_expression              alias
from        schema.table  t
left join   schema.other  o
on          o.id = t.id
where       1=1
and         t.flag = 1
group by    t.id
```

- Keywords that align to the river: `select`, `from`, every `join` variant, `on`,
  `where`, `and`, `or`, `group by`, `having`, `order by`, `set`, `update`,
  `insert into`, `values`.
- The operand column is wide enough for the longest of these (`insert into` = 11
  chars → operand at col 12).

## 3. Leading commas
List items (select list, `group by`, `order by`, `set` assignments, insert column
lists, `partition by`) break **before** the comma, and the comma is aligned in the
river column (directly under the first item):

```
select      a.col1                          col1
            ,a.col2                          col2
            ,a.col3                          col3
```

## 4. Aligned aliases (the second river)
In a `select` list, column aliases line up in a second vertical column, padded with
tabs to the next tab stop past the widest expression. **No `as`** — alias is
whitespace-separated.

## 5. `where 1=1`
Every `where` opens with the boilerplate `1=1`, then each real predicate is its own
line led by `and` / `or` in the keyword column:

```
where       1=1
and         t.reference_month = @mo
and         t.count_total > 0
```
This makes predicates trivially commentable/reorderable. The same `and`/`or`-per-line
rule applies to multi-condition `on` clauses.

## 6. Blank lines between blocks
One blank line separates the major blocks of a query for an airy, scannable layout:
between the `select` list and `from`, before **each** `join`, before `where`, before
`group by`, etc.

```
select      ...

from        big.table  t

left join   other.table  o
on          o.id = t.id

where       1=1
and         ...
```

## 7. `insert into`
Table and opening paren on the keyword line; the column list is indented **one tab**
(not to the river), leading commas, and the closing paren attaches to the last column.
The feeding `select` follows at the statement indent.

```
insert into base.target (
    col_a
    ,col_b
    ,col_c)
select      src.col_a                       col_a
            ,src.col_b                       col_b
            ,src.col_c                       col_c
from        ...
```

## 8. `update ... set ... from`
`update` names the target; `set` lists assignments with **leading commas and the `=`
signs aligned** into their own column; `from` + joins + `where 1=1` follow exactly like
a select.

```
update      rev
set         rev_total       = isnull(c.total,0)
            ,rev_toll       = 0
            ,rev_fuel       = isnull(c.fuel,0)

from        vs.revenue  rev

inner join  cache  c
on          c.id = rev.id

where       1=1
and         rev.reference_month = @mo
```

## 9. `case`
Multi-branch `case` is exploded one branch per line, `when … then …` kept together on
a line, `else` aligned with the `when`s, `end` closing the block; the alias follows
`end`.

```
,(case
    when x is null              then -1
    when x.type = 'FISICA'      then 1
    else 0
end)                                        flag
```

## 10. Window functions — `over (...)`
Short windows stay on one line: `row_number() over (order by getdate()) mov_id`.
Long windows explode, giving `partition by` / `order by` their own mini-river one
level in, closing paren + alias attached to the last line:

```
,row_number() over (
    partition by    pa.customer_nrc
                    ,pa.access_point_id
    order by        pa.promo_start_date asc)    sorting_asc
```

## 11. CTEs — `with name as (...)`
`with <name> as (` on its own line at the statement indent; the inner query is indented
one tab and formatted with all the rules above; the closing paren attaches to the inner
query's last line. A blank line, then the consuming statement.

```
with cte_count as (
    select      customer_id
                ,max(temp_order)            max_order
    from        base.history
    group by    customer_id)

update      base
set         ...
```

## 12. Banner comments for sections
Logical sections are separated by a star-banner block comment, indented to match the
surrounding code:

```
/*********************************************************************
 * What this section does
 *********************************************************************/
```

## 13. Inline spacing conventions
- No space inside argument lists after commas: `isnull(x,0)`, `in (5,6)`, `numeric(20,2)`.
- Spaces around comparison/logical/arithmetic operators in predicates and expressions:
  `o.id = t.id`, `a + b`. (The lone exception is the `1=1` boilerplate.)
- `.` binds tight: `schema.table.column`.
- Statement terminator `;` attaches to the last token.

---

### Scope note for the auto-formatter
The formatter targets the **query DML** you write day-to-day on Databricks —
`select` / `insert … select` / `update … from` / `delete`, CTEs, `case`, window
functions, subqueries. Procedural T-SQL wrappers (`create/alter procedure`, `declare`,
`exec`, `if`, `begin … end`, `use`, `go`) are **passed through untouched** rather than
re-flowed, so pasting a whole stored procedure reformats the embedded queries and leaves
the scaffolding alone.
