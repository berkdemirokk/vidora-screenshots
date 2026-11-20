import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['**/out/**','**/dist/**','**/.next/**','**/.expo/**','**/node_modules/**','**/next-env.d.ts']}, ...tseslint.configs.recommended);
