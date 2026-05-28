import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Client extends Model<InferAttributes<Client>, InferCreationAttributes<Client>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare razon_social: string;
  declare rfc: string;
  declare contacto: string;
  declare telefono: string;
  declare calle: CreationOptional<string | null>;
  declare colonia: CreationOptional<string | null>;
  declare municipio: CreationOptional<string | null>;
  declare estado: CreationOptional<string | null>;
  declare cp: CreationOptional<string | null>;
  declare pais: CreationOptional<string | null>;
  declare numero_exterior: CreationOptional<string | null>;
  declare numero_interior: CreationOptional<string | null>;
  declare localidad: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare regimen_fiscal: CreationOptional<string | null>;
  declare estatus: CreationOptional<"activo" | "inactivo">;
  declare observaciones: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initClient(sequelize: Sequelize) {
  Client.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      razon_social: { type: DataTypes.STRING(255), allowNull: false },
      rfc: { type: DataTypes.STRING(32), allowNull: false },
      contacto: { type: DataTypes.STRING(255), allowNull: false },
      telefono: { type: DataTypes.STRING(64), allowNull: false },
      calle: { type: DataTypes.STRING(255), allowNull: true },
      colonia: { type: DataTypes.STRING(128), allowNull: true },
      municipio: { type: DataTypes.STRING(128), allowNull: true },
      estado: { type: DataTypes.STRING(64), allowNull: true },
      cp: { type: DataTypes.STRING(5), allowNull: true },
      pais: { type: DataTypes.STRING(3), allowNull: true, defaultValue: "MEX" },
      numero_exterior: { type: DataTypes.STRING(32), allowNull: true },
      numero_interior: { type: DataTypes.STRING(32), allowNull: true },
      localidad: { type: DataTypes.STRING(128), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      regimen_fiscal: { type: DataTypes.STRING(10), allowNull: true },
      estatus: { type: DataTypes.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    } as never,
    { sequelize, tableName: "clients", underscored: true },
  );
}
