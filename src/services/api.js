import axios from 'axios';

// REPLACE THIS with your computer's actual IP address
const API_URL = 'https://raaz-api.onrender.com/api'; 

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;