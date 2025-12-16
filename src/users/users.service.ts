import { Injectable } from '@nestjs/common';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

@Injectable()
export class UsersService {
  private users: User[] = [
    {
      id: '1',
      email: 'admin@example.com',
      name: 'Administrateur',
      roles: ['admin', 'user'],
    },
    {
      id: '2',
      email: 'user@example.com',
      name: 'Utilisateur',
      roles: ['user'],
    },
  ];

  findAll(): User[] {
    return this.users;
  }

  findOne(id: string): User | undefined {
    return this.users.find((user) => user.id === id);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find((user) => user.email === email);
  }
}

