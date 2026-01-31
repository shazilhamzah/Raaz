import axios from 'axios';
import { API_URL } from '@env';

// REPLACE THIS with your computer's actual IP address
// const API_URL = 'https://raaz-api.onrender.com/api';
// // const API_URL = 'http://192.168.1.15:5000/api'; 

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;