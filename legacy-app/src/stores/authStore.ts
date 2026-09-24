import { create } from "zustand";
import type { User } from "../services/firebase";

export interface LocalUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string;
  email: string;
}

export type AppUser = User | LocalUser;

interface AuthState {
  currentUser: AppUser | null;
  isAuthChecking: boolean;
  setCurrentUser: (user: AppUser | null) => void;
  setIsAuthChecking: (isChecking: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isAuthChecking: true,
  setCurrentUser: (currentUser) => set({ currentUser }),
  setIsAuthChecking: (isAuthChecking) => set({ isAuthChecking }),
  reset: () => set({ currentUser: null, isAuthChecking: false }),
}));
