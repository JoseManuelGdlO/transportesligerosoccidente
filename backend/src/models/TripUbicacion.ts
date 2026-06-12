import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type UbicacionTipo = "Origen" | "Destino";

export class TripUbicacion extends Model<
  InferAttributes<TripUbicacion>,
  InferCreationAttributes<TripUbicacion>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare trip_id: string;
  declare orden: number;
  declare tipo: UbicacionTipo;
  declare rfc: CreationOptional<string | null>;
  declare nombre: CreationOptional<string | null>;
  declare fecha_hora: CreationOptional<Date | null>;
  declare calle: CreationOptional<string | null>;
  declare colonia: CreationOptional<string | null>;
  declare colonia_clave: CreationOptional<string | null>;
  declare municipio: CreationOptional<string | null>;
  declare municipio_clave: CreationOptional<string | null>;
  declare localidad: CreationOptional<string | null>;
  declare localidad_clave: CreationOptional<string | null>;
  declare estado: CreationOptional<string | null>;
  declare cp: CreationOptional<string | null>;
  declare numero_exterior: CreationOptional<string | null>;
  declare numero_interior: CreationOptional<string | null>;
  declare pais: CreationOptional<string | null>;
  declare id_ubicacion_sat: CreationOptional<string | null>;
  declare client_ubicacion_id: CreationOptional<string | null>;
  declare distancia_km: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTripUbicacion(sequelize: Sequelize) {
  TripUbicacion.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      orden: { type: DataTypes.INTEGER, allowNull: false },
      tipo: { type: DataTypes.ENUM("Origen", "Destino"), allowNull: false },
      rfc: { type: DataTypes.STRING(13), allowNull: true },
      nombre: { type: DataTypes.STRING(255), allowNull: true },
      fecha_hora: { type: DataTypes.DATE, allowNull: true },
      calle: { type: DataTypes.STRING(255), allowNull: true },
      colonia: { type: DataTypes.STRING(128), allowNull: true },
      colonia_clave: { type: DataTypes.STRING(16), allowNull: true },
      municipio: { type: DataTypes.STRING(128), allowNull: true },
      municipio_clave: { type: DataTypes.STRING(16), allowNull: true },
      localidad: { type: DataTypes.STRING(128), allowNull: true },
      localidad_clave: { type: DataTypes.STRING(16), allowNull: true },
      estado: { type: DataTypes.STRING(64), allowNull: true },
      cp: { type: DataTypes.STRING(5), allowNull: true },
      numero_exterior: { type: DataTypes.STRING(32), allowNull: true },
      numero_interior: { type: DataTypes.STRING(32), allowNull: true },
      pais: { type: DataTypes.STRING(3), allowNull: true, defaultValue: "MEX" },
      id_ubicacion_sat: { type: DataTypes.STRING(16), allowNull: true },
      client_ubicacion_id: { type: DataTypes.CHAR(36), allowNull: true },
      distancia_km: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    } as never,
    { sequelize, tableName: "trip_ubicaciones", underscored: true },
  );
}
