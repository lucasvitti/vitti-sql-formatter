/* quick iteration harness: node test.js */
const SQLFmt = require('./sqlfmt.js');

const cases = {
  basic: `select a.reference_month, a.access_point_id, isnull(a.spend,0) total
from base.usage a left join dim.rate r on r.month = a.month
where a.month = 202205 and a.total > 0
group by a.reference_month, a.access_point_id`,

  insert: `INSERT INTO base.target (reference_month, customer_nrc, total)
select u.reference_month, u.customer_nrc, sum(u.value) total
from base.usage u
where u.flag = 1
group by u.reference_month, u.customer_nrc`,

  update: `update rev set rev_total = isnull(c.total,0), rev_toll = 0, rev_fuel = isnull(c.fuel,0)
from vs.revenue rev inner join cache c on c.id = rev.id and c.month = rev.month
where rev.reference_month = 202205`,

  caseexpr: `select cust.nrc, (case when cust.birthdate is null then -1 else year(getdate()) - year(cust.birthdate) end) idade, (case when cust.type = 'FISICA' then 1 else 0 end) flag_b2c
from register.customer cust
where 1=1`,

  window: `select pa.customer_nrc, pa.promo_id, row_number() over (partition by pa.customer_nrc, pa.access_point_id order by pa.promo_start_date asc) sorting_asc
from base.promotion_attribution pa`,

  cte: `with cte_count as (select customer_id, max(temp_order) max_order from base.history group by customer_id)
update base set blocking = c.max_order from base.history base inner join cte_count c on c.customer_id = base.customer_id`,
};

const only = process.argv[2];
Object.keys(cases).forEach(name => {
  if (only && name !== only) return;
  console.log('\n===== ' + name + ' =====');
  try {
    const out = SQLFmt.format(cases[name]);
    console.log(out.replace(/\t/g, '····')); // show tabs as dots for inspection
  } catch (e) {
    console.log('ERROR:', e.message, '\n', e.stack);
  }
});
