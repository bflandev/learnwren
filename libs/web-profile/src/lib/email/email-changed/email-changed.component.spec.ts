import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { EmailChangedComponent } from './email-changed.component';
import { EmailChangeService } from '../email-change.service';
import { AuthService } from '@learnwren/web-auth';

function setup(confirmImpl: () => Promise<unknown>) {
  const navigate = vi.fn().mockResolvedValue(true);
  const logout = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    imports: [EmailChangedComponent],
    providers: [
      { provide: EmailChangeService, useValue: { confirm: vi.fn(confirmImpl) } },
      { provide: AuthService, useValue: { logout } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const fixture = TestBed.createComponent(EmailChangedComponent);
  return { fixture, navigate, logout };
}

describe('EmailChangedComponent', () => {
  it('on changed:true logs out and routes to /login?emailChanged=1', async () => {
    const { fixture, navigate, logout } = setup(() => Promise.resolve({ changed: true, email: 'new@x.com' }));
    await fixture.componentInstance.ngOnInit();
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { emailChanged: 1 } });
  });

  it('treats a 401 (session already revoked) as success', async () => {
    const { fixture, navigate, logout } = setup(() =>
      Promise.reject(new HttpErrorResponse({ status: 401 })),
    );
    await fixture.componentInstance.ngOnInit();
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { emailChanged: 1 } });
  });

  it('on changed:false routes back to the profile page', async () => {
    const { fixture, navigate, logout } = setup(() => Promise.resolve({ changed: false }));
    await fixture.componentInstance.ngOnInit();
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/settings/profile']);
  });
});
