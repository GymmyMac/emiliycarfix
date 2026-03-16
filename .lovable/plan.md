

## Add "Remember me" to Login

Add a checkbox that saves the user's email to `localStorage` so it's pre-filled on return visits. When unchecked, the saved email is cleared.

### Changes

**`src/pages/Login.tsx`**:
- Import `Checkbox` from `@/components/ui/checkbox`
- On mount, read `localStorage.getItem('rememberedEmail')` to pre-fill email and set checkbox state
- Add a "Remember me" checkbox between the password field and the submit button
- On login success: if checked, save email to `localStorage`; if unchecked, remove it
- Initialize `rememberMe` state based on whether a saved email exists

