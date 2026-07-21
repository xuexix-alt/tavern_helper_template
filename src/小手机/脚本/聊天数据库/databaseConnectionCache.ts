export interface DatabaseConnectionCacheDependencies<TDatabase> {
  openConnection(): Promise<TDatabase>;
  setVersionChangeHandler(database: TDatabase, handler: () => void): void;
  closeConnection(database: TDatabase): void;
  onConnected(database: TDatabase): void;
  onDisconnected(database: TDatabase): void;
}

export interface DatabaseConnectionCache<TDatabase> {
  open(): Promise<TDatabase>;
}

export function createDatabaseConnectionCache<TDatabase>(
  dependencies: DatabaseConnectionCacheDependencies<TDatabase>,
): DatabaseConnectionCache<TDatabase> {
  let connectionPromise: Promise<TDatabase> | null = null;
  let currentConnection: TDatabase | null = null;

  return {
    open(): Promise<TDatabase> {
      if (connectionPromise) return connectionPromise;

      let pendingConnection: Promise<TDatabase>;
      try {
        pendingConnection = dependencies.openConnection();
      } catch (error) {
        pendingConnection = Promise.reject(error);
      }
      connectionPromise = pendingConnection;

      pendingConnection.then(
        database => {
          if (connectionPromise !== pendingConnection) {
            dependencies.closeConnection(database);
            return;
          }

          currentConnection = database;
          dependencies.onConnected(database);
          dependencies.setVersionChangeHandler(database, () => {
            dependencies.closeConnection(database);
            if (currentConnection !== database) return;
            currentConnection = null;
            connectionPromise = null;
            dependencies.onDisconnected(database);
          });
        },
        () => {
          if (connectionPromise === pendingConnection) connectionPromise = null;
        },
      );

      return pendingConnection;
    },
  };
}
