export default {
  name: 'Login',
  description: 'POST /login: credentials, token and required fields.',
  items: [
    {
      name: 'should log in with valid credentials and return a bearer token',
      method: 'POST',
      path: '/login',
      body: '{{payload}}',
      prerequest({ seed, vars, prepare }) {
        prepare(
          seed.user().then(user => {
            vars.set({ email: user.email });
            vars.payload({ email: user.email, password: user.password });
          }),
        );
      },
      test({ validate, vars }) {
        validate.response(200, 'login');
        validate.tokenIssuedFor(vars.get('email'));
      },
    },
    {
      name: 'should reject a wrong password',
      method: 'POST',
      path: '/login',
      body: '{{payload}}',
      prerequest({ seed, vars, prepare }) {
        prepare(seed.user().then(user => vars.payload({ email: user.email, password: 'Wrong!Password1' })));
      },
      test({ validate }) {
        validate.rejected(401, 'Email e/ou senha inválidos');
      },
    },
    {
      name: 'should reject an email that is not registered',
      method: 'POST',
      path: '/login',
      body: '{{payload}}',
      prerequest({ data, vars }) {
        const user = data.user();
        vars.payload({ email: user.email, password: user.password });
      },
      test({ validate }) {
        validate.rejected(401, 'Email e/ou senha inválidos');
      },
    },
    {
      name: 'should require email and password',
      method: 'POST',
      path: '/login',
      body: '{{payload}}',
      prerequest({ vars }) {
        vars.payload({});
      },
      test({ validate }) {
        validate.response(400);
        validate.fieldErrors({ email: 'email é obrigatório', password: 'password é obrigatório' });
      },
    },
  ],
};
