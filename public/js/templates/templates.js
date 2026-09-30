import Handlebars from 'handlebars';

import catalogSource from './catalog.hbs?raw';
import loginSource from './login.hbs?raw';
import productCardSource from './product-card.hbs?raw';
import signupSource from './signup.hbs?raw';

export const catalogTemplate = Handlebars.compile(catalogSource);
export const loginTemplate = Handlebars.compile(loginSource);
export const productCardTemplate = Handlebars.compile(productCardSource);
export const signupTemplate = Handlebars.compile(signupSource);
