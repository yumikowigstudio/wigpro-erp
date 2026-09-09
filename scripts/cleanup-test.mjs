// Disabled permanently: the previous implementation also deleted customers, albums,
// appointments, employees, and other real business records.
console.error('Broad cleanup is disabled. Run audit-company-reset.mjs and review a scoped reset manifest first.')
process.exitCode = 1
