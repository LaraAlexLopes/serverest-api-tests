export default {
  name: 'Products',
  description: '/produtos: admin-only writes, validation, uniqueness and deletion rules.',
  items: [
    {
      name: 'should create a product as admin and persist it',
      method: 'POST',
      path: '/produtos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        const product = data.product();
        vars.set({ product });
        vars.payload(product);
        prepare(seed.adminSession().then(admin => vars.set({ token: admin.token })));
      },
      test({ validate, vars }) {
        validate.productCreated(vars.json('product'));
      },
    },
    {
      name: 'should forbid regular users from creating products',
      method: 'POST',
      path: '/produtos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        const product = data.product();
        vars.set({ productName: product.nome });
        vars.payload(product);
        prepare(seed.session().then(user => vars.set({ token: user.token })));
      },
      test({ validate, vars }) {
        validate.rejected(403, 'Rota exclusiva para administradores');
        validate.productsWithName(vars.get('productName'), 0);
      },
    },
    {
      name: 'should reject product creation without a token',
      method: 'POST',
      path: '/produtos',
      body: '{{payload}}',
      prerequest({ data, vars }) {
        const product = data.product();
        vars.set({ productName: product.nome });
        vars.payload(product);
      },
      test({ validate, vars }) {
        validate.unauthorized();
        validate.productsWithName(vars.get('productName'), 0);
      },
    },
    {
      name: 'should reject product creation with an invalid token',
      method: 'POST',
      path: '/produtos',
      auth: 'Bearer invalid.token.value',
      body: '{{payload}}',
      prerequest({ data, vars }) {
        const product = data.product();
        vars.set({ productName: product.nome });
        vars.payload(product);
      },
      test({ validate, vars }) {
        validate.unauthorized();
        validate.productsWithName(vars.get('productName'), 0);
      },
    },
    {
      name: 'should not create a product with a name already in use',
      method: 'POST',
      path: '/produtos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        prepare(
          seed.adminSession().then(admin =>
            seed.product(admin.token).then(existing => {
              vars.set({ token: admin.token, productName: existing.nome });
              vars.payload(data.product({ nome: existing.nome }));
            }),
          ),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Já existe produto com esse nome');
        validate.productsWithName(vars.get('productName'), 1);
      },
    },
    {
      name: 'should reject invalid product fields',
      method: 'POST',
      path: '/produtos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        vars.payload(data.product({ preco: -1, descricao: '', quantidade: -2 }));
        prepare(seed.adminSession().then(admin => vars.set({ token: admin.token })));
      },
      test({ validate }) {
        validate.response(400);
        validate.fieldErrors({
          preco: 'preco deve ser um número positivo',
          descricao: 'descricao não pode ficar em branco',
          quantidade: 'quantidade deve ser maior ou igual a 0',
        });
      },
    },
    {
      name: 'should update a product and persist the changes',
      method: 'PUT',
      path: '/produtos/{{productId}}',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          seed.adminSession().then(admin =>
            seed.product(admin.token).then(product => {
              const changes = {
                ...product,
                preco: product.preco + 5,
                quantidade: 3,
                descricao: `${product.descricao} v2`,
              };
              delete changes._id;
              vars.set({ token: admin.token, productId: product._id, changes });
              vars.payload(changes);
            }),
          ),
        );
      },
      test({ validate, vars }) {
        validate.updated();
        validate.productStored(vars.get('productId'), vars.json('changes'));
      },
    },
    {
      name: 'should delete a product',
      method: 'DELETE',
      path: '/produtos/{{productId}}',
      auth: '{{token}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          seed
            .adminSession()
            .then(admin =>
              seed.product(admin.token).then(product => vars.set({ token: admin.token, productId: product._id })),
            ),
        );
      },
      test({ validate, vars }) {
        validate.deleted();
        validate.productNotStored(vars.get('productId'));
      },
    },
    {
      name: 'should not delete a product that is in a cart',
      method: 'DELETE',
      path: '/produtos/{{productId}}',
      auth: '{{token}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
            seed.product(admin.token).then(product =>
              seed.cart(buyer.token, [{ product, quantity: 1 }]).then(() => {
                vars.set({
                  token: admin.token,
                  productId: product._id,
                  product: { ...product, quantidade: product.quantidade - 1 },
                });
              }),
            ),
          ),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Não é permitido excluir produto que faz parte de carrinho');
        validate.productStored(vars.get('productId'), vars.json('product'));
      },
    },
  ],
};
