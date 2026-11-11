export default {
  name: 'Authorization',
  description: 'Tokens that must no longer grant access.',
  items: [
    {
      name: 'should reject the token of a user who was deleted',
      method: 'POST',
      path: '/produtos',
      auth: '{{token}}',
      body: '{{payload}}',
      prerequest({ seed, api, data, vars, prepare }) {
        const product = data.product();
        vars.set({ productName: product.nome });
        vars.payload(product);
        prepare(
          seed
            .adminSession()
            .then(admin => api.delete(`/usuarios/${admin._id}`).then(() => vars.set({ token: admin.token }))),
        );
      },
      test({ validate, vars }) {
        validate.unauthorized();
        validate.productsWithName(vars.get('productName'), 0);
      },
    },
  ],
};
