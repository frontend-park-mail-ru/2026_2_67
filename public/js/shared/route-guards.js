const authenticatedRoutes = new Set(['/cart', '/checkout']);

/** Returns whether the route is unavailable without an authenticated user. */
export function requiresAuthentication(path, user) {
  return authenticatedRoutes.has(path) && !user;
}

/** Cancels a link activation when its destination is currently unavailable. */
export function blockUnavailableNavigation(event, isAvailable) {
  if (isAvailable) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
}

/** Returns whether a loaded, empty checkout should return to the cart page. */
export function shouldLeaveEmptyCheckout({ isPageActive, isLoading, errorMessage, canCheckout }) {
  return isPageActive && !isLoading && !errorMessage && !canCheckout;
}
