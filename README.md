# ServeRest API Tests

[![API tests](https://github.com/LaraAlexLopes/serverest-api-tests/actions/workflows/api-tests.yml/badge.svg)](https://github.com/LaraAlexLopes/serverest-api-tests/actions/workflows/api-tests.yml)
[![Reports](https://img.shields.io/badge/reports-htmlextra-orange)](https://laraalexlopes.github.io/serverest-api-tests)

API test automation for [ServeRest](https://serverest.dev), an e-commerce REST API for testing practice. The Postman collections are **generated from code** and run by **Newman**, locally against ServeRest in Docker and every night against the public environment.

The suite checks more than status codes. After each request, it asks the server what was stored: the user that was created, the stock left after a cart, the cart totals recalculated on the client.

## Stack

Postman · Newman · JavaScript · JSON Schema · htmlextra · Docker · GitHub Actions

## What is covered

**Regression: 32 requests, 151 assertions**

| Area          | Scenarios                                                                                             | Server-side check                    |
| ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Login         | Valid login (JWT issued for the right email), wrong password, unknown email, required fields          | —                                    |
| Users         | Create regular and admin users, duplicate email, get by id, filter by email, update, delete           | Stored fields, unique email          |
| Users         | Update to an email in use, delete a user who has a cart                                               | User unchanged                       |
| Products      | Create as admin, forbidden for regular users, no token, invalid token, duplicate name, invalid fields | Product not created when rejected    |
| Products      | Update, delete, delete a product that is in a cart                                                    | Stored fields, product kept          |
| Carts         | Create a cart with two products                                                                       | Totals recalculated, stock reserved  |
| Carts         | Over stock, second cart, duplicate product, unknown product, no token                                 | Stock unchanged, no cart created     |
| Carts         | Conclude purchase, cancel purchase                                                                    | Stock kept or restored, cart removed |
| Authorization | Token of a deleted user                                                                               | Product not created                  |

**User validation (data-driven):** [`data/invalid-users.csv`](data/invalid-users.csv) holds 10 cases. Each row breaks one field of `POST /usuarios` (blank, missing or invalid) and checks the exact error message and that no user was created.

**Contract:** every response is validated against a JSON Schema in [`src/schemas`](src/schemas).

## Findings

Defects found while writing the suite, each tracked as a [GitHub issue](https://github.com/LaraAlexLopes/serverest-api-tests/issues?q=is%3Aissue). Each one has a test in the **Known issues** collection that asserts the expected behaviour, so it fails until the defect is fixed. CI runs it without blocking the build.

| ID                                                                     | Severity | Defect                                                                                      | Expected                           |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- | ---------------------------------- |
| [KI-01](https://github.com/LaraAlexLopes/serverest-api-tests/issues/1) | High     | `GET /usuarios` returns every user's **password in plain text**                             | Passwords never returned           |
| [KI-02](https://github.com/LaraAlexLopes/serverest-api-tests/issues/2) | Low      | `GET /usuarios/{id}` with an unknown id returns `400`                                       | `404 Not Found`                    |
| [KI-03](https://github.com/LaraAlexLopes/serverest-api-tests/issues/3) | Low      | `GET /produtos/{id}` with an unknown id returns `400`                                       | `404 Not Found`                    |
| [KI-04](https://github.com/LaraAlexLopes/serverest-api-tests/issues/4) | Low      | `DELETE /usuarios/{id}` with an unknown id returns `200` ("Nenhum registro excluído")       | `404 Not Found`                    |
| [KI-05](https://github.com/LaraAlexLopes/serverest-api-tests/issues/5) | Medium   | `DELETE /carrinhos/concluir-compra` without a cart returns `200` with a "not found" message | A `4xx` error                      |
| [KI-06](https://github.com/LaraAlexLopes/serverest-api-tests/issues/6) | Medium   | `PUT /usuarios/{id}` with an unknown id creates a user **under a different, generated id**  | `404`, or create with the given id |

The regression suite documents the current behaviour where a test depends on it. For example, a deleted user is checked through the current `400 Usuário não encontrado` response.

## How it is built

```
src/
├── lib/lib.js        shared library injected into every script (api, seed, validate, cleanup)
├── schemas/          JSON Schemas for each response type
└── collections/
    ├── regression/   one file per folder: login, users, products, carts, auth
    ├── validation/   data-driven request, fed by data/invalid-users.csv
    ├── known-issues/ tests for the findings
    └── shared/       cleanup folder appended to every collection
scripts/build.mjs     turns the definitions into Postman collections (postman/*.json)
```

Each request is a plain object. Its scripts are real functions, so they are linted, formatted and reviewed as code:

```js
{
  name: 'should not delete a product that is in a cart',
  method: 'DELETE',
  path: '/produtos/{{productId}}',
  auth: '{{token}}',
  prerequest({ seed, vars, prepare }) {
    prepare(
      Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
        seed.product(admin.token).then(product =>
          seed.cart(buyer.token, [{ product, quantity: 1 }]).then(() => vars.set({ token: admin.token, productId: product._id })),
        ),
      ),
    );
  },
  test({ validate, vars }) {
    validate.rejected(400, 'Não é permitido excluir produto que faz parte de carrinho');
    validate.productStored(vars.get('productId'), vars.json('product'));
  },
}
```

`npm run build` writes the collections to [`postman/`](postman). They are committed, so they can be imported into Postman, and CI fails if they drift from the source.

### Engineering notes

Newman 6 runs scripts in an older Postman sandbox. These findings shaped the design:

- **Shared helpers bound to the wrong `pm`.** Functions defined in the collection script keep that script's `pm`: `pm.response` is empty, and requests sent from them are not awaited. The library is therefore a factory, `lib(pm)`, and the build injects `const { … } = lib(pm);` at the top of every script.
- **`async` tests give false positives.** A failing assertion inside `pm.test(name, async () => …)` is reported as passed. Tests stay synchronous, and server-side checks register their `pm.test` when the promise settles.
- **Legacy globals collide with variable names.** The sandbox already defines `data`, so `const data` fails. The build wraps every script in a block.
- **Out-of-scope references only fail at runtime.** The build lints each generated script with `no-undef`, so a script that uses something defined outside its function breaks the build, not the run.

## Test data

1. **Generated:** names, emails and products come from Postman dynamic variables (Faker), so runs never collide.
2. **Seeded through the API:** each request creates the data it needs in its pre-request script, so it can run on its own.
3. **Tagged:** every user email starts with `qa.<runId>.` and every product name with `QA <runId>`.
4. **Swept:** the last folder of each collection cancels this run's carts (restoring stock), then deletes its products and users, and asserts that nothing was left behind.

## Running locally

**Requirements:** Node 24 (`nvm use`) and Docker.

```bash
nvm use
npm install
npm run server:up          # ServeRest on http://localhost:3000
npm test                   # build + regression + data-driven validation
npm run test:known-issues  # findings, expected to fail
npm run test:dev           # regression against https://serverest.dev
npm run server:down
```

The HTML and JUnit reports are written to `reports/`.

To explore in Postman, import a collection from `postman/` and an environment from `environments/`.

## CI

[`.github/workflows/api-tests.yml`](.github/workflows/api-tests.yml):

1. **Quality:** lint, format, and a check that `postman/` matches the source.
2. **Local:** ServeRest in Docker, then regression, data-driven validation and known issues (non-blocking). Reports are uploaded as an artifact and, on `main`, published to GitHub Pages.
3. **Public:** every night (and on demand), the regression runs against `serverest.dev`.

## Conventions

- Code, test names, commits and docs are in English.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint.
- The pre-commit hook runs lint, the format check and the build, and rejects the commit if `postman/` is out of date.

## Author

**Lara Lopes**, QA Engineer · [LinkedIn](https://linkedin.com/in/laraalexandralopes) · [GitHub](https://github.com/LaraAlexLopes)
