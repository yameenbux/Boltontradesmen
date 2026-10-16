-- Plan 2b Task 2: email normalisation and the disposable-domain block list in the database.
-- The normalise_email table is the same literal table as tests/unit/email.test.ts (Review Focus 1).
begin;
select plan(14);

select is(private.normalise_email('  Sarah.Khan+bv@GoogleMail.com '), 'sarahkhan@gmail.com', 'Gmail dots, +tag, case, spaces and googlemail.com');
select is(private.normalise_email('sarahkhan@gmail.com'), 'sarahkhan@gmail.com', 'the plain Gmail form is unchanged');
select is(private.normalise_email('Jo.Bloggs+x@Outlook.com'), 'jo.bloggs@outlook.com', 'dots kept outside Gmail; +tag dropped');
select is(private.normalise_email(''), null, 'empty is invalid');
select is(private.normalise_email('no-at-sign'), null, 'no @ is invalid');
select is(private.normalise_email('a@b'), null, 'no dot in the domain is invalid');
select is(private.normalise_email('a b@c.com'), null, 'a space inside is invalid');
select is(private.normalise_email(repeat('a', 243) || '@example.com'), null, 'a 255-character address is invalid');
select is(private.normalise_email(null), null, 'null is invalid');

select ok(private.email_domain_blocked('a@x.mailinator.com'), 'a subdomain of a listed domain is blocked');
select ok(private.email_domain_blocked(' A@Mailinator.COM '), 'a listed domain is blocked, any case');
select ok(not private.email_domain_blocked('a@gmail.com'), 'gmail.com is not blocked');

set local role anon;
select throws_ok($$select count(*) from public.blocked_email_domains$$, '42501', null, 'anon cannot read blocked_email_domains');
reset role;
set local role authenticated;
select throws_ok($$select count(*) from public.blocked_email_domains$$, '42501', null, 'authenticated cannot read blocked_email_domains');
reset role;

select * from finish();
rollback;
