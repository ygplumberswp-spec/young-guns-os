export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  companyName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
};

export type AuthSession = {
  accessToken: string;
  expiresIn: number;
};

export type SignupRequest = {
  companyName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};
