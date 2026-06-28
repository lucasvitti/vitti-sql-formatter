const SQLFmt = require('./sqlfmt.js');
const cases = {
  sumcase: `select @mo reference_month, bm.customer_id customer_nrc, sum(case when et.event_type_id in (5,6) then 0 when bm.event_date >= @mo_start then 0 else et.event_type_sign end) flag_base_begin
from base.base_movements bm inner join base.event_type et on et.event_type_id = bm.event_type_id
where et.event_type_id in (1,2,5,6) and bm.source_system_id = 2
group by bm.customer_id, bm.access_point_id`,

  subquery: `select x.id, x.total from (select a.id, sum(a.v) total from base.a a where a.flag=1 group by a.id) x where x.total > 100`,

  unionq: `select id, 'a' src from base.a where flag = 1 union all select id, 'b' src from base.b where flag = 2`,

  having: `select a.cust, count(1) qt from base.movement a group by a.cust having count(1) > 1 order by 2 desc`,

  derived_join: `select t.id, c.name from base.t t inner join (select id, name from dim.customer where active = 1) c on c.id = t.cust_id where t.month = 202205`,

  delete: `delete from base.staging where reference_month = @mo and flag = 0`,
};
const only = process.argv[2];
Object.keys(cases).forEach(name => {
  if (only && name !== only) return;
  console.log('\n===== ' + name + ' =====');
  try { console.log(SQLFmt.format(cases[name]).replace(/\t/g, '····')); }
  catch (e) { console.log('ERROR:', e.message, '\n', e.stack); }
});
