export default {
  name: 'ServeRest - User validation (data-driven)',
  description: 'Runs once per row of data/invalid-users.csv: each row breaks one field of POST /usuarios.',
  folders: [
    {
      name: 'User validation',
      description: 'Each iteration sends a payload with one invalid field and expects the matching error.',
      items: [
        {
          name: 'should reject an invalid user payload',
          method: 'POST',
          path: '/usuarios',
          body: '{{payload}}',
          prerequest({ data, vars, iteration }) {
            const valid = data.user();
            const payload = {};
            ['nome', 'email', 'password', 'administrador'].forEach(field => {
              const value = iteration.get(field);
              if (value === '<missing>') return;
              payload[field] = value === '<valid>' ? valid[field] : value;
            });
            vars.set({ email: payload.email || '' });
            vars.payload(payload);
          },
          test({ validate, vars, iteration }) {
            validate.response(400);
            validate.fieldErrors(
              { [iteration.get('field')]: iteration.get('expectedError') },
              `${iteration.get('case')}: reports "${iteration.get('expectedError')}"`,
            );
            if (vars.get('email').includes('@')) validate.usersWithEmail(vars.get('email'), 0);
          },
        },
      ],
    },
  ],
};
