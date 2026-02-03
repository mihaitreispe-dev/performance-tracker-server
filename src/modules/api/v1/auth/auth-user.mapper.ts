import { User } from 'src/database/interfaces';

export const authUserFromUser = (user: User) => ({
  id: user.id,
  displayName: user.display_name,
  firstName: user.first_name,
  lastName: user.last_name,
  roles: user.roles,
});
