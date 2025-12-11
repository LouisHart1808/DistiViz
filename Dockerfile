FROM nginx:alpine

RUN mkdir -p /var/cache/nginx /var/run/nginx /tmp/nginx \
    && chown -R nginx:nginx /var/cache/nginx /var/run/nginx /tmp/nginx \
    && printf 'client_body_temp_path /tmp/nginx/client_temp;\nproxy_temp_path /tmp/nginx/proxy_temp;\nfastcgi_temp_path /tmp/nginx/fastcgi_temp;\nuwsgi_temp_path /tmp/nginx/uwsgi_temp;\nscgi_temp_path /tmp/nginx/scgi_temp;\n' > /etc/nginx/conf.d/temp-paths.conf

WORKDIR /usr/share/nginx/html

COPY . .

EXPOSE 80

USER nginx

CMD ["nginx", "-g", "daemon off;"]
