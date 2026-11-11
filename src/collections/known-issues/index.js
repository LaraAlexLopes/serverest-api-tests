export default {
  name: 'ServeRest - Known issues',
  description:
    'Each request asserts the expected behaviour of a defect found during testing. These tests fail until the defect is fixed; see the Findings section of the README.',
  folders: [
    {
      name: 'Known issues',
      description: 'Expected to fail while the defects are open.',
      items: [
        {
          name: 'KI-01 GET /usuarios should not expose user passwords (#1)',
          method: 'GET',
          path: '/usuarios?email={{email}}',
          prerequest({ seed, vars, prepare }) {
            prepare(seed.user().then(user => vars.set({ email: user.email })));
          },
          test({ validate }) {
            validate.status(200);
            pm.test('response does not contain the password of any user', () => {
              pm.response.json().usuarios.forEach(user => pm.expect(user).to.not.have.property('password'));
            });
          },
        },
        {
          name: 'KI-02 GET /usuarios/{id} should return 404 for an unknown user (#2)',
          method: 'GET',
          path: '/usuarios/{{unknownId}}',
          prerequest({ data, vars }) {
            vars.set({ unknownId: data.unknownId() });
          },
          test({ validate }) {
            validate.status(404);
          },
        },
        {
          name: 'KI-03 GET /produtos/{id} should return 404 for an unknown product (#3)',
          method: 'GET',
          path: '/produtos/{{unknownId}}',
          prerequest({ data, vars }) {
            vars.set({ unknownId: data.unknownId() });
          },
          test({ validate }) {
            validate.status(404);
          },
        },
        {
          name: 'KI-04 DELETE /usuarios/{id} should return 404 for an unknown user (#4)',
          method: 'DELETE',
          path: '/usuarios/{{unknownId}}',
          prerequest({ data, vars }) {
            vars.set({ unknownId: data.unknownId() });
          },
          test({ validate }) {
            validate.status(404);
          },
        },
        {
          name: 'KI-05 DELETE /carrinhos/concluir-compra should fail when the user has no cart (#5)',
          method: 'DELETE',
          path: '/carrinhos/concluir-compra',
          auth: '{{token}}',
          prerequest({ seed, vars, prepare }) {
            prepare(seed.session().then(user => vars.set({ token: user.token })));
          },
          test() {
            pm.test('responds with a client error', () => pm.expect(pm.response.code).to.be.within(400, 499));
          },
        },
        {
          name: 'KI-06 PUT /usuarios/{id} should not create a user under a different id (#6)',
          method: 'PUT',
          path: '/usuarios/{{unknownId}}',
          body: '{{payload}}',
          prerequest({ data, vars }) {
            vars.set({ unknownId: data.unknownId() });
            vars.payload(data.user());
          },
          test({ vars }) {
            pm.test('either rejects the unknown id or keeps it for the new user', () => {
              if (pm.response.code === 201) pm.expect(pm.response.json()._id).to.eql(vars.get('unknownId'));
              else pm.expect(pm.response.code).to.eql(404);
            });
          },
        },
      ],
    },
  ],
};
