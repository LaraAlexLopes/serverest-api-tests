import auth from './auth.js';
import carts from './carts.js';
import login from './login.js';
import products from './products.js';
import users from './users.js';

export default {
  name: 'ServeRest - Regression',
  description: 'Functional regression of the ServeRest API: users, login, products and carts, with server-side checks.',
  folders: [login, users, products, carts, auth],
};
