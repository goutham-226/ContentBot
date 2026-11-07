import {UseSate} from 'react';
import type {FormEvent} from 'react';
import './LoginPage.css';

type LoginResponse = {user: string};

function FakeLogin(identifier: string, password: string): Promise<LoginResponse> {
    return new Promise ((resolve,reject) => {
        setTimeout(() => {
            if (password == 'Mypass1234')
            {
                resolve({user: identifier});
            }
            else
            {
                reject(new Error('Wrong Password!'));
            }
        },1000);
        
    });
}