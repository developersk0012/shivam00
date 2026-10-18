FROM python:3.12-alpine
RUN addgroup -S -g 10001 botuser && adduser -S -u 10001 -G botuser botuser
WORKDIR /app
RUN pip install --no-cache-dir --disable-pip-version-check python-telegram-bot==21.10
COPY entrypoint.sh /entrypoint.sh
RUN chmod 0555 /entrypoint.sh
USER 10001:10001
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENTRYPOINT ["/entrypoint.sh"]
