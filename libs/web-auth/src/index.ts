export { AuthService } from './lib/auth.service';
export { authGuard } from './lib/auth.guard';
export { withCredentialsInterceptor } from './lib/with-credentials.interceptor';
export { LoginPageComponent } from './lib/login-page/login-page.component';
export { RegisterPageComponent } from './lib/register-page/register-page.component';
export { passwordPolicyValidator } from './lib/password-policy.validator';
export type { AuthenticatedUser, WebUserRole } from './lib/types/authenticated-user';
export type { ApiAuthErrorBody, ApiAuthErrorCode } from './lib/types/api-error';
