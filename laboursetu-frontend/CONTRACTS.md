# Public API contract maintenance

The backend's src/shared and route/controller responses are authoritative. No OpenAPI
specification exists in the source snapshot; generating one during a structural
migration would require annotating every API and cannot guarantee response parity.

src/contracts/index.ts temporarily contains only the public DTOs/constants consumed
by this frontend: auth inputs/user, dashboard metrics, worker enums and trade list.
It contains no database code, backend services, authorization or wage calculations.

For an API change, review the backend request schema and serialized response,
update corresponding frontend DTOs in the same release, run both typechecks and
API tests, then exercise login, dashboard, workers, sites, attendance and export
against the candidate backend. Preserve compatibility when deploying in stages.
Introduce a reviewed backend OpenAPI spec and openapi-typescript generation later;
commit generated frontend DTOs to avoid requiring another checkout during builds.
