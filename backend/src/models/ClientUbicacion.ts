import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type ClientUbicacionTipo = "Origen" | "Destino" | "Ambos";

export class ClientUbicacion extends Model<
  InferAttributes<ClientUbicacion>,
  InferCreationAttributes<ClientUbicacion>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare client_id: string;
  declare nombre: string;
  declare rfc: CreationOptional<string | null>;
  declare razon_social: CreationOptional<string | null>;
  declare tipo: ClientUbicacionTipo;
  declare calle: CreationOptional<string | null>;
  declare numero_exterior: CreationOptional<string | null>;
  declare numero_interior: CreationOptional<string | null>;
  declare colonia: CreationOptional<string | null>;
  declare colonia_clave: CreationOptional<string | null>;
  declare localidad: CreationOptional<string | null>;
  declare localidad_clave: CreationOptional<string | null>;
  declare municipio: CreationOptional<string | null>;
  declare municipio_clave: CreationOptional<string | null>;
  declare estado: CreationOptional<string | null>;
  declare pais: CreationOptional<string | null>;
  declare cp: CreationOptional<string | null>;
  declare estatus: CreationOptional<"activo" | "inactivo">;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initClientUbicacion(sequelize: Sequelize) {
  ClientUbicacion.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      client_id: { type: DataTypes.CHAR(36), allowNull: false },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      rfc: { type: DataTypes.STRING(13), allowNull: true },
      razon_social: { type: DataTypes.STRING(255), allowNull: true },
      tipo: {
        type: DataTypes.ENUM("Origen", "Destino", "Ambos"),
        allowNull: false,
        defaultValue: "Ambos",
      },
      calle: { type: DataTypes.STRING(255), allowNull: true },
      numero_exterior: { type: DataTypes.STRING(32), allowNull: true },
      numero_interior: { type: DataTypes.STRING(32), allowNull: true },
      colonia: { type: DataTypes.STRING(128), allowNull: true },
      colonia_clave: { type: DataTypes.STRING(16), allowNull: true },
      localidad: { type: DataTypes.STRING(128), allowNull: true },
      localidad_clave: { type: DataTypes.STRING(16), allowNull: true },
      municipio: { type: DataTypes.STRING(128), allowNull: true },
      municipio_clave: { type: DataTypes.STRING(16), allowNull: true },
      estado: { type: DataTypes.STRING(64), allowNull: true },
      pais: { type: DataTypes.STRING(3), allowNull: true, defaultValue: "MEX" },
      cp: { type: DataTypes.STRING(5), allowNull: true },
      estatus: { type: DataTypes.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
    } as never,
    { sequelize, tableName: "client_ubicaciones", underscored: true },
  );
}
