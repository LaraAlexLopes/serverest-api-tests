export default {
  name: 'Carts',
  description:
    '/carrinhos: totals recalculated on the client, stock reservation, purchase completion and cancellation.',
  items: [
    {
      name: 'should create a cart, reserve stock and compute totals',
      method: 'POST',
      path: '/carrinhos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
            Promise.all([seed.product(admin.token), seed.product(admin.token)]).then(([mouse, keyboard]) => {
              const items = [
                { product: mouse, quantity: 2 },
                { product: keyboard, quantity: 1 },
              ];
              vars.set({ token: buyer.token, userId: buyer._id, items });
              vars.payload({
                produtos: items.map(item => ({ idProduto: item.product._id, quantidade: item.quantity })),
              });
            }),
          ),
        );
      },
      test({ validate, vars }) {
        const items = vars.json('items');
        validate.created();
        validate.cartStored(vars.get('userId'), items);
        items.forEach(item => validate.stock(item.product._id, item.product.quantidade - item.quantity));
      },
    },
    {
      name: 'should reject a cart with more items than the stock',
      method: 'POST',
      path: '/carrinhos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
            seed.product(admin.token, { quantidade: 3 }).then(product => {
              vars.set({ token: buyer.token, userId: buyer._id, productId: product._id });
              vars.payload({ produtos: [{ idProduto: product._id, quantidade: 5 }] });
            }),
          ),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Produto não possui quantidade suficiente');
        validate.stock(vars.get('productId'), 3);
        validate.noCart(vars.get('userId'));
      },
    },
    {
      name: 'should allow only one cart per user',
      method: 'POST',
      path: '/carrinhos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
            seed.product(admin.token).then(product =>
              seed.cart(buyer.token, [{ product, quantity: 1 }]).then(() => {
                vars.set({ token: buyer.token, productId: product._id });
                vars.payload({ produtos: [{ idProduto: product._id, quantidade: 1 }] });
              }),
            ),
          ),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Não é permitido ter mais de 1 carrinho');
        validate.stock(vars.get('productId'), 9);
      },
    },
    {
      name: 'should reject the same product twice in a cart',
      method: 'POST',
      path: '/carrinhos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
            seed.product(admin.token).then(product => {
              vars.set({ token: buyer.token, userId: buyer._id });
              vars.payload({
                produtos: [
                  { idProduto: product._id, quantidade: 1 },
                  { idProduto: product._id, quantidade: 1 },
                ],
              });
            }),
          ),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Não é permitido possuir produto duplicado');
        validate.noCart(vars.get('userId'));
      },
    },
    {
      name: 'should reject a cart with a product that does not exist',
      method: 'POST',
      path: '/carrinhos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        vars.payload({ produtos: [{ idProduto: data.unknownId(), quantidade: 1 }] });
        prepare(seed.session().then(buyer => vars.set({ token: buyer.token, userId: buyer._id })));
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Produto não encontrado');
        validate.noCart(vars.get('userId'));
      },
    },
    {
      name: 'should conclude a purchase and keep the stock reserved',
      method: 'DELETE',
      path: '/carrinhos/concluir-compra',
      auth: '{{token}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
            seed.product(admin.token).then(product =>
              seed.cart(buyer.token, [{ product, quantity: 2 }]).then(() => {
                vars.set({ token: buyer.token, userId: buyer._id, productId: product._id });
              }),
            ),
          ),
        );
      },
      test({ validate, vars }) {
        validate.deleted();
        validate.noCart(vars.get('userId'));
        validate.stock(vars.get('productId'), 8);
      },
    },
    {
      name: 'should cancel a purchase and restore the stock',
      method: 'DELETE',
      path: '/carrinhos/cancelar-compra',
      auth: '{{token}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()]).then(([admin, buyer]) =>
            seed.product(admin.token).then(product =>
              seed.cart(buyer.token, [{ product, quantity: 2 }]).then(() => {
                vars.set({ token: buyer.token, userId: buyer._id, productId: product._id });
              }),
            ),
          ),
        );
      },
      test({ validate, vars }) {
        validate.deleted('Registro excluído com sucesso. Estoque dos produtos reabastecido');
        validate.noCart(vars.get('userId'));
        validate.stock(vars.get('productId'), 10);
      },
    },
    {
      name: 'should require a token to create a cart',
      method: 'POST',
      path: '/carrinhos',
      body: '{"produtos": []}',
      test({ validate }) {
        validate.unauthorized();
      },
    },
  ],
};
