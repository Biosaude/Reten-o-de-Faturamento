import {createApp} from './app';
import express from 'express';
import {resolve} from 'node:path';
const app=createApp(true);
app.use(express.static(resolve('dist')));
app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
app.listen(3001,'127.0.0.1',()=>console.log('API local autenticada disponível na porta 3001 (loopback).'));
