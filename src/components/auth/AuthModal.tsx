import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { motion, AnimatePresence } from 'motion/react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const handleSuccess = () => {
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
    >
      <div className="py-1">
        <AnimatePresence mode="wait">
          {mode === 'login' ? (
            <motion.div
              key="modal-auth-login"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <LoginForm
                onSuccess={handleSuccess}
                onSwitchToRegister={() => setMode('register')}
              />
            </motion.div>
          ) : (
            <motion.div
              key="modal-auth-register"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <RegisterForm
                onSuccess={handleSuccess}
                onSwitchToLogin={() => setMode('login')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
