export default {
  name: 'Users',
  description: '/usuarios: create, read, update and delete, with business rules checked on the server.',
  items: [
    {
      name: 'should create a regular user and persist it',
      method: 'POST',
      path: '/usuarios',
      body: '{{payload}}',
      prerequest({ data, vars }) {
        const user = data.user();
        vars.set({ user });
        vars.payload(user);
      },
      test({ validate, vars }) {
        validate.userCreated(vars.json('user'));
      },
    },
    {
      name: 'should create an admin user and persist the admin flag',
      method: 'POST',
      path: '/usuarios',
      body: '{{payload}}',
      prerequest({ data, vars }) {
        const user = data.user({ administrador: 'true' });
        vars.set({ user });
        vars.payload(user);
      },
      test({ validate, vars }) {
        validate.userCreated(vars.json('user'));
      },
    },
    {
      name: 'should not create a user with an email already in use',
      method: 'POST',
      path: '/usuarios',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        prepare(
          seed.user().then(existing => {
            vars.set({ email: existing.email });
            vars.payload(data.user({ email: existing.email }));
          }),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Este email já está sendo usado');
        validate.usersWithEmail(vars.get('email'), 1);
      },
    },
    {
      name: 'should get a user by id',
      method: 'GET',
      path: '/usuarios/{{userId}}',
      prerequest({ seed, vars, prepare }) {
        prepare(seed.user().then(user => vars.set({ userId: user._id, user })));
      },
      test({ validate, vars }) {
        const user = vars.json('user');
        validate.response(200, 'user');
        validate.includes({ _id: user._id, nome: user.nome, email: user.email, administrador: user.administrador });
      },
    },
    {
      name: 'should list users filtered by email',
      method: 'GET',
      path: '/usuarios?email={{email}}',
      prerequest({ seed, vars, prepare }) {
        prepare(seed.user().then(user => vars.set({ email: user.email, userId: user._id })));
      },
      test({ validate, vars }) {
        validate.response(200, 'users');
        validate.singleResult('usuarios', { _id: vars.get('userId'), email: vars.get('email') });
      },
    },
    {
      name: 'should update a user and persist the changes',
      method: 'PUT',
      path: '/usuarios/{{userId}}',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        prepare(
          seed.user().then(user => {
            const changes = { ...data.user({ email: user.email }), administrador: 'true' };
            vars.set({ userId: user._id, changes });
            vars.payload(changes);
          }),
        );
      },
      test({ validate, vars }) {
        validate.updated();
        validate.userStored(vars.get('userId'), vars.json('changes'));
      },
    },
    {
      name: 'should not update a user to an email already in use',
      method: 'PUT',
      path: '/usuarios/{{userId}}',
      body: '{{payload}}',
      prerequest({ seed, data, vars, prepare }) {
        prepare(
          Promise.all([seed.user(), seed.user()]).then(([user, other]) => {
            vars.set({ userId: user._id, user });
            vars.payload(data.user({ email: other.email }));
          }),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Este email já está sendo usado');
        validate.userStored(vars.get('userId'), vars.json('user'));
      },
    },
    {
      name: 'should delete a user',
      method: 'DELETE',
      path: '/usuarios/{{userId}}',
      prerequest({ seed, vars, prepare }) {
        prepare(seed.user().then(user => vars.set({ userId: user._id })));
      },
      test({ validate, vars }) {
        validate.deleted();
        validate.userNotStored(vars.get('userId'));
      },
    },
    {
      name: 'should not delete a user who has a cart',
      method: 'DELETE',
      path: '/usuarios/{{userId}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          Promise.all([seed.adminSession(), seed.session()])
            .then(([admin, buyer]) =>
              seed
                .product(admin.token)
                .then(product => seed.cart(buyer.token, [{ product, quantity: 1 }]).then(() => buyer)),
            )
            .then(buyer => vars.set({ userId: buyer._id, user: buyer })),
        );
      },
      test({ validate, vars }) {
        validate.rejected(400, 'Não é permitido excluir usuário com carrinho cadastrado');
        validate.userStored(vars.get('userId'), vars.json('user'));
      },
    },
  ],
};
