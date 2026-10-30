FROM alpine:3.20
ARG PB_VERSION=0.23.12
RUN apk add --no-cache unzip ca-certificates
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip
COPY pb_hooks /pb/pb_hooks
COPY pb_migrations /pb/pb_migrations
# Railway injects PORT. Mount a volume at /pb/pb_data so data survives redeploys.
CMD /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080} --dir=/pb/pb_data --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations
