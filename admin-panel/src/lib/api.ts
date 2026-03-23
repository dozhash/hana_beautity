import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_BASE ? `${API_BASE.replace(/\/$/, '')}/api` : '/api',
});

