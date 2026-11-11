export default {
  name: 'Cleanup',
  description: 'Removes every user, product and cart created by this run, identified by the run prefix.',
  items: [
    {
      name: 'should remove all data created by this run',
      method: 'GET',
      path: '/usuarios',
      test({ cleanup, check }) {
        if (pm.info.iteration === pm.info.iterationCount - 1) {
          check('removes every user and product created by this run', cleanup.run(), ([users, products]) => {
            pm.expect(users, 'users left behind').to.have.lengthOf(0);
            pm.expect(products, 'products left behind').to.have.lengthOf(0);
          });
        }
      },
    },
  ],
};
