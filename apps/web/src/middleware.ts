import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const passthrough = () => NextResponse.next();

export default hasClerkKeys ? clerkMiddleware() : passthrough;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
