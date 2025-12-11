FROM nginx:alpine

RUN mkdir -p /var/cache/nginx /var/run/nginx \ 
    && chown -R nginx:nginx /var/cache/nginx /var/run/nginx

WORKDIR /usr/share/nginx/html

COPY . .

EXPOSE 80

USER nginx

CMD ["nginx", "-g", "daemon off;"]
