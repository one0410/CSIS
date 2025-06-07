import { CanActivateFn } from '@angular/router';

export const AuthGuard: CanActivateFn = (route, state) => {
  
  // read from local storage
  const isLogin = localStorage.getItem('isLogin') || sessionStorage.getItem('isLogin');
  console.log('authguard isLogin', isLogin);
  if (isLogin === 'true') {
    return true;
  } else {
    // redirect to login page
    window.location.href = '/login';

    return false;
  }
};
