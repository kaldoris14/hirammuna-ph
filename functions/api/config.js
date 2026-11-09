import {json} from '../_lib/shared.js';
export function onRequestGet({env}){return json({turnstile_site_key:env.TURNSTILE_SITE_KEY||'',ready:Boolean(env.DB&&env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY)});}
