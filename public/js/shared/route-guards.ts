const authenticatedRoutes = new Set(['/cart', '/checkout']);

export interface CheckoutState {
  isPageActive: boolean;
  isLoading: boolean;
  errorMessage: string;
  canCheckout: boolean;
}

/** Returns whether the route is unavailable without an authenticated user. */
export function requiresAuthentication(path: string, user: object | null): boolean {
  return authenticatedRoutes.has(path) && !user;
}

/** Cancels a link activation when its destination is currently unavailable. */
export function blockUnavailableNavigation(event: Event, isAvailable: boolean): boolean {
  if (isAvailable) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
}

/** Returns whether a loaded, empty checkout should return to the cart page. */
export function shouldLeaveEmptyCheckout({ isPageActive, isLoading, errorMessage, canCheckout }: CheckoutState): boolean {
  return isPageActive && !isLoading && !errorMessage && !canCheckout;
}
