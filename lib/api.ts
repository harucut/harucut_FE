"use client";

import axios from "axios";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

if (!baseURL) {
  throw new Error("NEXT_PUBLIC_BASE_URL is not set");
}

export const api = axios.create({
  baseURL,
  withCredentials: true,
});
