export default function createLib(pm) {
  const PASSWORD = 'QaSuite!2026';
  const EMAIL_DOMAIN = 'qa-suite.dev';

  const runId = () => {
    let id = pm.collectionVariables.get('runId');
    if (!id) {
      id = Date.now().toString(36);
      pm.collectionVariables.set('runId', id);
    }
    return id;
  };

  const userPrefix = () => `qa.${runId()}.`;
  const productPrefix = () => `QA ${runId()} `;
  const fake = template => pm.variables.replaceIn(template);
  const shortId = () => fake('{{$randomUUID}}').slice(0, 8);
  const slug = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  const send = request =>
    new Promise((resolve, reject) =>
      pm.sendRequest(request, (error, response) => (error ? reject(error) : resolve(response))),
    );

  const request = (method, path, { body, token } = {}) =>
    send({
      url: `${pm.environment.get('baseUrl')}${path}`,
      method,
      header: [
        { key: 'Content-Type', value: 'application/json' },
        ...(token ? [{ key: 'Authorization', value: token }] : []),
      ],
      body: body === undefined ? undefined : { mode: 'raw', raw: JSON.stringify(body) },
    });

  const api = {
    get: (path, token) => request('GET', path, { token }),
    post: (path, body, token) => request('POST', path, { body, token }),
    put: (path, body, token) => request('PUT', path, { body, token }),
    delete: (path, token) => request('DELETE', path, { token }),
  };

  const expectStatus = (response, code, action) => {
    if (response.code !== code) {
      throw new Error(`${action} returned ${response.code}: ${response.text()}`);
    }
    return response.json();
  };

  const sequence = (items, step) => items.reduce((chain, item) => chain.then(() => step(item)), Promise.resolve());

  const data = {
    password: PASSWORD,
    userPrefix,
    productPrefix,
    user: (overrides = {}) => {
      const firstName = fake('{{$randomFirstName}}');
      return {
        nome: `${firstName} ${fake('{{$randomLastName}}')}`,
        email: `${userPrefix()}${slug(firstName)}.${shortId()}@${EMAIL_DOMAIN}`,
        password: PASSWORD,
        administrador: 'false',
        ...overrides,
      };
    },
    product: (overrides = {}) => ({
      nome: `${productPrefix()}${fake('{{$randomProductName}}')} ${shortId()}`,
      preco: Number(fake('{{$randomInt}}')) + 10,
      descricao: fake('{{$randomCatchPhrase}}'),
      quantidade: 10,
      ...overrides,
    }),
    unknownId: () => fake('{{$randomUUID}}').replace(/-/g, '').slice(0, 16),
  };

  const seed = {
    user: overrides => {
      const user = data.user(overrides);
      return api
        .post('/usuarios', user)
        .then(response => ({ ...user, _id: expectStatus(response, 201, 'create user')._id }));
    },
    login: user =>
      api
        .post('/login', { email: user.email, password: user.password })
        .then(response => expectStatus(response, 200, 'login').authorization),
    session: overrides => seed.user(overrides).then(user => seed.login(user).then(token => ({ ...user, token }))),
    adminSession: () => seed.session({ administrador: 'true' }),
    product: (adminToken, overrides) => {
      const product = data.product(overrides);
      return api
        .post('/produtos', product, adminToken)
        .then(response => ({ ...product, _id: expectStatus(response, 201, 'create product')._id }));
    },
    cart: (token, items) =>
      api
        .post(
          '/carrinhos',
          { produtos: items.map(item => ({ idProduto: item.product._id, quantidade: item.quantity })) },
          token,
        )
        .then(response => expectStatus(response, 201, 'create cart')._id),
  };

  const vars = {
    set: values =>
      Object.entries(values).forEach(([key, value]) =>
        pm.variables.set(key, typeof value === 'string' ? value : JSON.stringify(value)),
      ),
    get: key => pm.variables.get(key),
    json: key => JSON.parse(pm.variables.get(key)),
    payload: body => pm.variables.set('payload', JSON.stringify(body)),
  };

  const prepare = promise =>
    promise.catch(error => pm.variables.set('setupError', error && error.message ? error.message : String(error)));

  if (pm.response && pm.variables.get('setupError')) {
    const setupError = pm.variables.get('setupError');
    pm.variables.unset('setupError');
    pm.test('test data setup', () => {
      throw new Error(setupError);
    });
  }

  const check = (name, promise, assertion) =>
    promise
      .then(value => pm.test(name, () => assertion(value)))
      .catch(error =>
        pm.test(name, () => {
          throw error;
        }),
      );

  const body = () => pm.response.json();
  const jwtPayload = token => JSON.parse(require('atob')(token.replace(/^Bearer /, '').split('.')[1]));
  const userFields = user => ({ nome: user.nome, email: user.email, administrador: user.administrador });
  const productFields = product => ({
    nome: product.nome,
    preco: product.preco,
    descricao: product.descricao,
    quantidade: product.quantidade,
  });
  const cartOf = userId =>
    api.get(`/carrinhos?idUsuario=${userId}`).then(response => expectStatus(response, 200, 'list carts').carrinhos);

  const validate = {
    status: code => pm.test(`responds with status ${code}`, () => pm.response.to.have.status(code)),
    message: text => pm.test(`returns the message "${text}"`, () => pm.expect(body().message).to.eql(text)),
    fieldErrors: (errors, label) =>
      pm.test(label || `reports the field errors: ${Object.keys(errors).join(', ')}`, () =>
        pm.expect(body()).to.include(errors),
      ),
    includes: expected => pm.test('returns the expected fields', () => pm.expect(body()).to.include(expected)),
    singleResult: (listKey, expected) =>
      pm.test(`returns exactly one ${listKey} item with the expected fields`, () => {
        pm.expect(body().quantidade).to.eql(1);
        pm.expect(body()[listKey][0]).to.include(expected);
      }),
    schema: name => pm.test(`matches the ${name} schema`, () => pm.response.to.have.jsonSchema(schemas[name])),

    response: (code, schemaName) => {
      validate.status(code);
      pm.test('responds with JSON', () =>
        pm.expect(pm.response.headers.get('Content-Type')).to.match(/application\/json/),
      );
      if (schemaName) validate.schema(schemaName);
    },

    created: () => {
      validate.response(201, 'created');
      validate.message('Cadastro realizado com sucesso');
      return body()._id;
    },

    updated: () => {
      validate.response(200, 'message');
      validate.message('Registro alterado com sucesso');
    },

    deleted: (message = 'Registro excluído com sucesso') => {
      validate.response(200, 'message');
      validate.message(message);
    },

    userCreated: expected => validate.userStored(validate.created(), expected),

    productCreated: expected => validate.productStored(validate.created(), expected),

    rejected: (code, message) => {
      validate.response(code, 'message');
      validate.message(message);
    },

    unauthorized: () =>
      validate.rejected(401, 'Token de acesso ausente, inválido, expirado ou usuário do token não existe mais'),

    tokenIssuedFor: email => {
      pm.test('issues a bearer token for the logged-in user', () => {
        const { authorization } = body();
        pm.expect(authorization).to.match(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
        pm.expect(jwtPayload(authorization).email).to.eql(email);
      });
    },

    userStored: (id, expected) =>
      check('server stores the user with the expected data', api.get(`/usuarios/${id}`), response => {
        pm.expect(response.code).to.eql(200);
        pm.expect(userFields(response.json())).to.eql(userFields(expected));
      }),

    userNotStored: id =>
      check('server no longer has the user', api.get(`/usuarios/${id}`), response => {
        pm.expect(response.code).to.eql(400);
        pm.expect(response.json().message).to.eql('Usuário não encontrado');
      }),

    usersWithEmail: (email, count) =>
      check(
        `server has ${count} user(s) with this email`,
        api.get(`/usuarios?email=${encodeURIComponent(email)}`),
        response => pm.expect(response.json().quantidade).to.eql(count),
      ),

    productStored: (id, expected) =>
      check('server stores the product with the expected data', api.get(`/produtos/${id}`), response => {
        pm.expect(response.code).to.eql(200);
        pm.expect(productFields(response.json())).to.eql(productFields(expected));
      }),

    productNotStored: id =>
      check('server no longer has the product', api.get(`/produtos/${id}`), response => {
        pm.expect(response.code).to.eql(400);
        pm.expect(response.json().message).to.eql('Produto não encontrado');
      }),

    productsWithName: (name, count) =>
      check(
        `server has ${count} product(s) with this name`,
        api.get(`/produtos?nome=${encodeURIComponent(name)}`),
        response => pm.expect(response.json().quantidade).to.eql(count),
      ),

    stock: (productId, quantity) =>
      check(`product stock is ${quantity}`, api.get(`/produtos/${productId}`), response =>
        pm.expect(response.json().quantidade).to.eql(quantity),
      ),

    cartStored: (userId, items) =>
      check('server stores the cart with recalculated totals', cartOf(userId), carts => {
        pm.expect(carts).to.have.lengthOf(1);
        const [cart] = carts;
        const expectedTotal = items.reduce((total, item) => total + item.product.preco * item.quantity, 0);
        const expectedQuantity = items.reduce((total, item) => total + item.quantity, 0);
        pm.expect(cart.precoTotal).to.eql(expectedTotal);
        pm.expect(cart.quantidadeTotal).to.eql(expectedQuantity);
        items.forEach(item => {
          const line = cart.produtos.find(product => product.idProduto === item.product._id);
          pm.expect(line, `cart line for ${item.product.nome}`).to.include({
            quantidade: item.quantity,
            precoUnitario: item.product.preco,
          });
        });
      }),

    noCart: userId =>
      check('user has no cart on the server', cartOf(userId), carts => pm.expect(carts).to.have.lengthOf(0)),
  };

  const cleanup = {
    run: () => {
      const runUsers = () =>
        api
          .get('/usuarios')
          .then(response =>
            expectStatus(response, 200, 'list users').usuarios.filter(user => user.email.startsWith(userPrefix())),
          );
      const runProducts = () =>
        api
          .get('/produtos')
          .then(response =>
            expectStatus(response, 200, 'list products').produtos.filter(product =>
              product.nome.startsWith(productPrefix()),
            ),
          );

      return seed.adminSession().then(admin =>
        runUsers()
          .then(users =>
            api
              .get('/carrinhos')
              .then(response => expectStatus(response, 200, 'list carts').carrinhos)
              .then(carts => users.filter(user => carts.some(cart => cart.idUsuario === user._id)))
              .then(usersWithCart =>
                sequence(usersWithCart, user =>
                  seed
                    .login({ email: user.email, password: PASSWORD })
                    .then(token => api.delete('/carrinhos/cancelar-compra', token)),
                ),
              )
              .then(runProducts)
              .then(products => sequence(products, product => api.delete(`/produtos/${product._id}`, admin.token)))
              .then(() => sequence(users, user => api.delete(`/usuarios/${user._id}`))),
          )
          .then(() => Promise.all([runUsers(), runProducts()])),
      );
    },
  };

  const iteration = { get: key => pm.iterationData.get(key) };

  return { api, data, seed, vars, iteration, prepare, check, validate, cleanup };
}
